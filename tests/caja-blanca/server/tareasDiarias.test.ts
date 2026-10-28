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
describe('mora.recalcularPendientes usa la fecha de negocio', () => {
  it('cuenta los días en Oracle con la fecha recibida y la guarda como FECHA_CALCULO', async () => {
    const { conn, ejecuto } = crearConexion([
      { sql: /SELECT d.ID_DOCUMENTO, d.SALDO/, rows: [
        { ID_DOCUMENTO: 1, SALDO: 1000, DIAS_VENCIDO: 15, DIAS_GRACIA: 10, PORCENTAJE_MORA: 5 },
        { ID_DOCUMENTO: 2, SALDO: 500, DIAS_VENCIDO: 10, DIAS_GRACIA: 10, PORCENTAJE_MORA: 5 },
      ] },
      { sql: /SELECT ID_MORA FROM CXC_MORA/, rows: [] },
    ]);
    db.getConnection.mockResolvedValue(conn);
    await expect(mora.recalcularPendientes('2026-10-28')).resolves.toMatchObject({ activas: 1 });

    expect(ejecuto(/SELECT d.ID_DOCUMENTO, d.SALDO/)[0].binds).toEqual({ hoy: '2026-10-28' });
    const insert = ejecuto(/INSERT INTO CXC_MORA/);
    // El documento 2 sigue en su período de gracia: no genera mora.
    expect(insert).toHaveLength(1);
    expect(insert[0].sql).toMatch(/TO_DATE\(:hoy, 'YYYY-MM-DD'\)/);
    expect(insert[0].binds).toMatchObject({ idDocumento: 1, diasMora: 5, montoMora: 50, hoy: '2026-10-28' });
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
