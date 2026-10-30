import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as convenios from '../../../server/src/modules/cxc/repositories/cobranza/convenioPago.repository';
import * as promesas from '../../../server/src/modules/cxc/repositories/cobranza/promesaPago.repository';
import * as catalogos from '../../../server/src/modules/cxc/repositories/catalogos.repository';

const HOY = '2026-10-27';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

function conexion(r: Regla[]) {
  const c = crearConexion(r);
  db.getConnection.mockResolvedValue(c.conn);
  return c;
}

// ---------------------------------------------------------------------------
describe('convenioPago.repository', () => {
  const input = { idCliente: 1, fechaConvenio: HOY, montoDeuda: 100, numeroCuotas: 2, estado: 'ACTIVO' as const, documentos: [{ idDocumento: 5, montoIncluido: 100 }] };
  const cuotas = [{ numeroCuota: 1, fechaVencimiento: '2026-11-27', monto: 50 }, { numeroCuota: 2, fechaVencimiento: '2026-12-27', monto: 50 }];

  it('createConCuotas: convenio, cuotas (saldo = monto) y documentos en una transacción', async () => {
    const { conn, ejecuto } = conexion([{ sql: /INSERT INTO CXC_CONVENIOS_PAGO/, outId: 3 }]);
    await expect(convenios.createConCuotas(input, cuotas, input.documentos)).resolves.toBe(3);
    expect(ejecuto(/INSERT INTO CXC_CONVENIO_CUOTAS/).map((e) => e.binds)).toEqual([
      { idConvenio: 3, numeroCuota: 1, fechaVencimiento: '2026-11-27', monto: 50 },
      { idConvenio: 3, numeroCuota: 2, fechaVencimiento: '2026-12-27', monto: 50 },
    ]);
    expect(ejecuto(/:monto, :monto, 'PENDIENTE'/)).toHaveLength(2);
    expect(ejecuto(/INSERT INTO CXC_CONVENIO_DOCUMENTOS/)[0].binds).toEqual({ idConvenio: 3, idDocumento: 5, montoIncluido: 100 });
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('createConCuotas: si falla una cuota no queda convenio a medias', async () => {
    const { conn } = conexion([{ sql: /INSERT INTO CXC_CONVENIOS_PAGO/, outId: 3 }]);
    const original = conn.execute.getMockImplementation()!;
    conn.execute.mockImplementation(async (sql: string, b?: Record<string, unknown>) => {
      if (/INSERT INTO CXC_CONVENIO_CUOTAS/.test(sql)) throw new Error('ORA-00001');
      return original(sql, b);
    });
    await expect(convenios.createConCuotas(input, cuotas, input.documentos)).rejects.toThrow('ORA-00001');
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('update: solo estado y observaciones; deuda y cuotas no se tocan', async () => {
    await convenios.update(3, { montoDeuda: 999, numeroCuotas: 5 });
    expect(db.getConnection).not.toHaveBeenCalled();
    const { ejecuto } = conexion([]);
    await convenios.update(3, { estado: 'CANCELADO', observaciones: 'Cliente desistio', montoDeuda: 999 });
    expect(ejecuto(/UPDATE CXC_CONVENIOS_PAGO/)[0].binds).toEqual({ id: 3, estado: 'CANCELADO', observaciones: 'Cliente desistio' });
  });
  it('OBSERVACIÓN: el estado se puede cambiar libremente (p. ej. CUMPLIDO → ACTIVO) sin validar la transición', async () => {
    const { ejecuto } = conexion([]);
    await convenios.update(3, { estado: 'ACTIVO' });
    expect(ejecuto(/UPDATE CXC_CONVENIOS_PAGO/)).toHaveLength(1);
  });

  it('remove: con cuotas abonadas → 409; virgen borra documentos, cuotas y convenio', async () => {
    conexion([{ sql: /SALDO < MONTO/, rows: [{ TOTAL: 1 }] }]);
    await expect(convenios.remove(3)).rejects.toThrow(/CANCELADO/);
    const { ejecuto } = conexion([{ sql: /SALDO < MONTO/, rows: [{ TOTAL: 0 }] }]);
    await convenios.remove(3);
    expect(ejecuto(/^DELETE/).map((e) => e.sql.match(/FROM (\w+)/)![1])).toEqual(['CXC_CONVENIO_DOCUMENTOS', 'CXC_CONVENIO_CUOTAS', 'CXC_CONVENIOS_PAGO']);
  });

  it('recalcularIncumplidos: solo ACTIVO con cuota pendiente vencida, a la fecha de Guatemala', async () => {
    const { ejecuto } = conexion([]);
    await expect(convenios.recalcularIncumplidos()).resolves.toBe(1);
    const upd = ejecuto(/SET ESTADO = 'INCUMPLIDO'/)[0];
    expect(upd.sql).toMatch(/cv.ESTADO = 'ACTIVO'/);
    expect(upd.binds).toMatchObject({ hoy: HOY });
  });

  it('OBSERVACIÓN: un documento que ya está en un convenio ACTIVO puede incluirse en otro', async () => {
    const { ejecuto } = conexion([]);
    await catalogos.findDocumentoPendienteDeCliente(1, 5);
    expect(ejecuto(/CXC_CONVENIO_DOCUMENTOS/)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('promesaPago.cerrarVencidas', () => {
  it('primero marca CUMPLIDAS y luego el resto de vencidas como INCUMPLIDAS, en una transacción', async () => {
    const { conn, ejecuto, ejecuciones } = conexion([]);
    await expect(promesas.cerrarVencidas(HOY)).resolves.toEqual({ cumplidas: 1, incumplidas: 1 });
    expect(ejecuciones.findIndex((e) => /'CUMPLIDA'/.test(e.sql))).toBeLessThan(ejecuciones.findIndex((e) => /'INCUMPLIDA'/.test(e.sql)));
    const [cumplidas, incumplidas] = [ejecuto(/SET ESTADO = 'CUMPLIDA'/)[0], ejecuto(/SET ESTADO = 'INCUMPLIDA'/)[0]];
    expect(cumplidas.sql).toMatch(/d.SALDO <= 0.005/);
    expect(cumplidas.sql).toMatch(/NOT IN \('ANULADO', 'REVERSADO'\)/);
    expect(incumplidas.binds).toEqual({ hoy: HOY });
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('OBSERVACIÓN: cuenta cualquier pago del cliente en el periodo, aunque se haya aplicado a otra factura', async () => {
    const { ejecuto } = conexion([]);
    await promesas.cerrarVencidas(HOY);
    const sql = ejecuto(/SET ESTADO = 'CUMPLIDA'/)[0].sql;
    expect(sql).toMatch(/pg.ID_CLIENTE = p.ID_CLIENTE/);
    expect(sql).not.toMatch(/ID_DOCUMENTO = p.ID_DOCUMENTO AND .*CXC_APLICACION_PAGOS/);
  });
  it('error revierte', async () => {
    const { conn } = conexion([]);
    conn.execute.mockRejectedValueOnce(new Error('ORA-00060 deadlock'));
    await expect(promesas.cerrarVencidas(HOY)).rejects.toThrow(/deadlock/);
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
});
