import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as promesas from '../../../server/src/modules/cxc/repositories/cobranza/promesaPago.repository';
import * as mora from '../../../server/src/modules/cxc/repositories/credito/mora.repository';
import { ejecutarTareasDiarias } from '../../../server/src/modules/cxc/shared/tareasDiarias';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T18:00:00Z'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Promesas vencidas: primero se reconocen las pagadas, el resto queda incumplida.
// ---------------------------------------------------------------------------
describe('promesaPago.cerrarVencidas', () => {
  it('marca CUMPLIDA antes que INCUMPLIDA, ambas solo sobre PENDIENTE vencidas, y confirma', async () => {
    const { conn, ejecuciones } = crearConexion([]);
    db.getConnection.mockResolvedValue(conn);
    await expect(promesas.cerrarVencidas('2026-10-28')).resolves.toEqual({ cumplidas: 1, incumplidas: 1 });

    const [cumplida, incumplida] = ejecuciones;
    expect(cumplida.sql).toMatch(/SET ESTADO = 'CUMPLIDA'/);
    expect(cumplida.sql).toMatch(/d.SALDO <= 0.005/);
    expect(cumplida.sql).toMatch(/pg.FECHA_PAGO BETWEEN TRUNC\(p.FECHA_PROMESA\) AND TRUNC\(p.FECHA_COMPROMISO\)/);
    expect(incumplida.sql).toMatch(/SET ESTADO = 'INCUMPLIDA'/);
    for (const e of ejecuciones) {
      expect(e.sql).toMatch(/p.ESTADO = 'PENDIENTE'/);
      expect(e.sql).toMatch(/p.FECHA_COMPROMISO < TO_DATE\(:hoy, 'YYYY-MM-DD'\)/);
      expect(e.binds).toEqual({ hoy: '2026-10-28' });
    }
    expect(conn.commit).toHaveBeenCalledOnce();
    expect(conn.close).toHaveBeenCalledOnce();
  });

  it('si Oracle falla revierte todo', async () => {
    const { conn } = crearConexion([]);
    conn.execute.mockRejectedValueOnce(new Error('ORA-00060'));
    db.getConnection.mockResolvedValue(conn);
    await expect(promesas.cerrarVencidas('2026-10-28')).rejects.toThrow('ORA-00060');
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Mora guardada: misma fecha de negocio que la vista en vivo.
// ---------------------------------------------------------------------------
describe('mora escalonada por tramos', () => {
  const tramos = [
    { DIAS_DESDE: 1, PORCENTAJE: 5 },
    { DIAS_DESDE: 16, PORCENTAJE: 6.5 },
    { DIAS_DESDE: 26, PORCENTAJE: 8 },
    { DIAS_DESDE: 41, PORCENTAJE: 10 },
  ];

  it.each([[0, 0], [1, 5], [15, 5], [16, 6.5], [25, 6.5], [26, 8], [40, 8], [41, 10], [200, 10]])(
    '%i días de mora -> %d %%',
    (dias, porcentaje) => expect(mora.porcentajeDeTramo(tramos, dias)).toBe(porcentaje),
  );
});

describe('mora.recalcularPendientes cobra con notas de débito', () => {
  const doc = (extra: Record<string, unknown> = {}) => ({
    ID_DOCUMENTO: 1, ID_CLIENTE: 7, CODIGO_CLIENTE: 'CR-00007', CLIENTE: 'Ana', DOCUMENTO: 'Factura FACT-00000001',
    ID_MONEDA: 21, MONEDA: 'GTQ', NIT_CLIENTE: '1234567-9',
    FECHA_DOCUMENTO: '2026-09-01', FECHA_VENCIMIENTO: '2026-09-28', FECHA_INICIO_MORA: '2026-10-08',
    DIAS_GRACIA: 10, DIAS_VENCIDO: 30, SALDO: 1000, SEGMENTO: 'B', REDUCCION_MORA: 1, EMITIDO: 40,
    ...extra,
  });
  const reglas = (o: { cartera?: unknown[]; cobrado?: number; tipoMora?: boolean } = {}) => crearConexion([
    { sql: /SELECT ID_TIPO_DOCUMENTO FROM CXC_TIPOS_DOCUMENTO WHERE ES_MORA = 'S'/, rows: o.tipoMora === false ? [] : [{ ID_TIPO_DOCUMENTO: 200 }] },
    { sql: /FROM CXC_TRAMOS_MORA/, rows: [
      { DIAS_DESDE: 1, PORCENTAJE: 5 }, { DIAS_DESDE: 16, PORCENTAJE: 6.5 },
      { DIAS_DESDE: 26, PORCENTAJE: 8 }, { DIAS_DESDE: 41, PORCENTAJE: 10 },
    ] },
    { sql: /AS EMITIDO/, rows: o.cartera ?? [doc(), doc({ ID_DOCUMENTO: 2, DIAS_VENCIDO: 8 })] },
    { sql: /SELECT NVL\(SUM\(TOTAL\), 0\) AS TOTAL FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO_ORIGEN/, rows: [{ TOTAL: o.cobrado ?? 40 }] },
    { sql: /SELECT ID_MORA FROM CXC_MORA/, rows: [] },
    { sql: /SELECT CODIGO FROM CXC_TIPOS_DOCUMENTO WHERE ID_TIPO_DOCUMENTO = :idTipoDocumento FOR UPDATE/, rows: [{ CODIGO: 'NDM' }] },
    { sql: /SELECT MAX\(CASE WHEN REGEXP_LIKE\(NUMERO_DOCUMENTO/, rows: [{ ULTIMO: 0 }] },
  ]);

  it('aplica tramo menos segmento y emite una nota solo por la diferencia', async () => {
    const { conn, ejecuto } = reglas();
    db.getConnection.mockResolvedValue(conn);
    // 30 días vencido - 10 de gracia = 20 días de mora -> tramo 6.5 %; segmento B resta 1 -> 5.5 %.
    await expect(mora.recalcularPendientes('2026-10-28')).resolves.toMatchObject({ activas: 1, notasEmitidas: 1, montoEmitido: 15 });

    expect(ejecuto(/INSERT INTO CXC_MORA/)[0].binds).toMatchObject({ idDocumento: 1, diasMora: 20, porcentaje: 5.5, montoMora: 55, hoy: '2026-10-28' });
    // Ya se habían cobrado Q40: la nueva nota es por Q15 y queda ligada a la factura.
    const nota = ejecuto(/INSERT INTO CXC_DOCUMENTOS/);
    expect(nota).toHaveLength(1);
    expect(nota[0].binds).toMatchObject({ monto: 15, idOrigen: 1, idTipo: 200, idCliente: 7, idMoneda: 21, serie: 'NDM', numero: '00000001', hoy: '2026-10-28' });
    // El documento se bloquea antes de sumar lo cobrado.
    expect(ejecuto(/WHERE ID_DOCUMENTO = :id FOR UPDATE/)[0].binds).toEqual({ id: 1 });
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it('si lo cobrado ya cubre el recargo no emite otra nota', async () => {
    const { conn, ejecuto } = reglas({ cobrado: 55 });
    db.getConnection.mockResolvedValue(conn);
    await expect(mora.recalcularPendientes('2026-10-28')).resolves.toMatchObject({ notasEmitidas: 0, montoEmitido: 0 });
    expect(ejecuto(/INSERT INTO CXC_DOCUMENTOS/)).toHaveLength(0);
  });

  it('sin tipo de documento de mora en la base no calcula nada y lo indica', async () => {
    const { conn, ejecuto } = reglas({ tipoMora: false });
    db.getConnection.mockResolvedValue(conn);
    await expect(mora.recalcularPendientes('2026-10-28')).rejects.toThrow(/ES_MORA = S/);
    expect(ejecuto(/INSERT INTO/)).toHaveLength(0);
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Tareas diarias: una falla no detiene a las demás.
// ---------------------------------------------------------------------------
describe('ejecutarTareasDiarias', () => {
  it('si una tarea falla, las siguientes igual corren y se registra el error', async () => {
    db.getConnection
      .mockRejectedValueOnce(new Error('pool agotado')) // mora
      .mockImplementation(async () => crearConexion([]).conn); // promesas y convenios
    await ejecutarTareasDiarias('2026-10-28');
    expect(db.getConnection).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"tarea":"mora"'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"tarea":"convenios"'));
  });
});
