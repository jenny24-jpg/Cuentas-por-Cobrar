import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as anticipos from '../../../server/src/modules/cxc/repositories/pagos/anticipo.repository';
import * as pagos from '../../../server/src/modules/cxc/repositories/pagos/pago.repository';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// Anticipo respaldado por un pago: el mismo dinero no puede contarse dos veces.
// ---------------------------------------------------------------------------
describe('anticipo.create — pago que lo respalda', () => {
  const reglas = (o: { pago?: unknown[]; aplicado?: number; otros?: number } = {}): Regla[] => [
    { sql: /SELECT ID_CLIENTE, MONTO, ESTADO FROM CXC_PAGOS WHERE ID_PAGO = :idPago FOR UPDATE/, rows: o.pago ?? [{ ID_CLIENTE: 10, MONTO: 500, ESTADO: 'NO_APLICADO' }] },
    { sql: /FROM CXC_APLICACION_PAGOS WHERE ID_PAGO = :idPago AND ESTADO = 'CONFIRMADA'/, rows: [{ TOTAL: o.aplicado ?? 0 }] },
    { sql: /COUNT\(\*\) AS TOTAL FROM CXC_ANTICIPOS WHERE ID_PAGO/, rows: [{ TOTAL: o.otros ?? 0 }] },
    { sql: /INSERT INTO CXC_ANTICIPOS/, outId: 40 },
  ];
  const datos = (extra: Record<string, unknown> = {}) =>
    ({ idCliente: 10, idPago: 1, fecha: '2026-10-27', ...extra }) as Parameters<typeof anticipos.create>[0];

  async function esperaError(r: Regla[], d: ReturnType<typeof datos>, mensaje: RegExp) {
    const { conn, ejecuto } = crearConexion(r);
    db.getConnection.mockResolvedValue(conn);
    await expect(anticipos.create(d)).rejects.toThrow(mensaje);
    expect(ejecuto(/INSERT INTO CXC_ANTICIPOS/)).toHaveLength(0);
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.close).toHaveBeenCalledOnce();
  }

  it('validación previa: fecha futura', async () => {
    await expect(anticipos.create(datos({ fecha: '2026-10-28' }))).rejects.toThrow(/futura/);
    expect(db.getConnection).not.toHaveBeenCalled();
  });
  it('pago inexistente', () => esperaError(reglas({ pago: [] }), datos(), /pago relacionado no existe/));
  it.each(['ANULADO', 'REVERSADO'])('pago %s', (ESTADO) =>
    esperaError(reglas({ pago: [{ ID_CLIENTE: 10, MONTO: 500, ESTADO }] }), datos(), /anulado o reversado/));
  it('pago de otro cliente', () =>
    esperaError(reglas({ pago: [{ ID_CLIENTE: 11, MONTO: 500, ESTADO: 'NO_APLICADO' }] }), datos(), /mismo cliente/));
  it('pago con aplicaciones a documentos', () => esperaError(reglas({ aplicado: 50 }), datos(), /ya tiene aplicaciones/));
  it('pago que ya respalda otro anticipo', () => esperaError(reglas({ otros: 1 }), datos(), /otro anticipo vigente/));
  it('éxito: el monto original y el disponible salen del pago, aunque se envíe otro', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await anticipos.create(datos({ montoOriginal: 1, montoDisponible: 1 }));
    expect(ejecuto(/INSERT INTO CXC_ANTICIPOS/)[0].binds).toMatchObject({ montoOriginal: 500, montoDisponible: 500 });
  });

  it('éxito: bloquea el pago antes de insertar y confirma', async () => {
    const { conn, ejecuciones } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await expect(anticipos.create(datos())).resolves.toBe(40);
    const orden = ejecuciones.map((e) => e.sql);
    expect(orden.findIndex((s) => /FOR UPDATE/.test(s))).toBeLessThan(orden.findIndex((s) => /INSERT INTO CXC_ANTICIPOS/.test(s)));
    expect(ejecuciones.find((e) => /COUNT\(\*\)/.test(e.sql))!.binds).toEqual({ idPago: 1, excluir: null });
    expect(conn.commit).toHaveBeenCalledOnce();
  });
});

describe('anticipo.update — revalida el respaldo excluyéndose a sí mismo', () => {
  const reglas = (actual: Record<string, unknown> = {}, otros = 0): Regla[] => [
    { sql: /FROM CXC_ANTICIPOS WHERE ID_ANTICIPO = :id FOR UPDATE/, rows: [{ ID_CLIENTE: 10, ID_PAGO: 1, ESTADO: 'DISPONIBLE', MONTO_ORIGINAL: 300, MONTO_DISPONIBLE: 300, FECHA_ISO: '2026-10-20', ...actual }] },
    { sql: /COUNT\(\*\) AS TOTAL FROM CXC_APLICACION_ANTICIPO/, rows: [{ TOTAL: 0 }] },
    { sql: /SELECT ID_CLIENTE, MONTO, ESTADO FROM CXC_PAGOS/, rows: [{ ID_CLIENTE: 10, MONTO: 500, ESTADO: 'NO_APLICADO' }] },
    { sql: /FROM CXC_APLICACION_PAGOS/, rows: [{ TOTAL: 0 }] },
    { sql: /COUNT\(\*\) AS TOTAL FROM CXC_ANTICIPOS/, rows: [{ TOTAL: otros }] },
  ];

  it('editar otro campo usa el pago y cliente actuales, se excluye del conteo y resincroniza el monto con el pago', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await anticipos.update(40, { fecha: '2026-10-21' });
    expect(ejecuto(/COUNT\(\*\) AS TOTAL FROM CXC_ANTICIPOS/)[0].binds).toEqual({ idPago: 1, excluir: 40 });
    const update = ejecuto(/UPDATE CXC_ANTICIPOS/);
    expect(update).toHaveLength(1);
    expect(update[0].binds).toMatchObject({ montoOriginal: 500 });
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('un anticipo heredado sin pago no puede editarse sin asignarle uno', async () => {
    const { conn, ejecuto } = crearConexion(reglas({ ID_PAGO: null }));
    db.getConnection.mockResolvedValue(conn);
    await expect(anticipos.update(40, { fecha: '2026-10-21' })).rejects.toThrow(/pago que respalda/);
    expect(ejecuto(/UPDATE CXC_ANTICIPOS/)).toHaveLength(0);
  });
  it('estado distinto de DISPONIBLE no se edita', async () => {
    const { conn } = crearConexion(reglas({ ESTADO: 'AGOTADO' }));
    db.getConnection.mockResolvedValue(conn);
    await expect(anticipos.update(40, { fecha: '2026-10-21' })).rejects.toThrow(/Solo los anticipos disponibles/);
  });
});

// ---------------------------------------------------------------------------
// Pago: no puede quedar anulado/editado/eliminado si respalda un anticipo.
// ---------------------------------------------------------------------------
describe('pago.anular', () => {
  const reglas = (o: { estado?: string; aplicado?: number; anticipos?: number; existe?: boolean } = {}): Regla[] => [
    { sql: /SELECT ESTADO FROM CXC_PAGOS WHERE ID_PAGO = :id FOR UPDATE/, rows: o.existe === false ? [] : [{ ESTADO: o.estado ?? 'NO_APLICADO' }] },
    { sql: /FROM CXC_APLICACION_PAGOS/, rows: [{ TOTAL: o.aplicado ?? 0 }] },
    { sql: /FROM CXC_ANTICIPOS WHERE ID_PAGO/, rows: [{ TOTAL: o.anticipos ?? 0 }] },
  ];
  const datos = { idEmpleadoAnulacion: 5, motivoAnulacion: 'Depósito rebotado por el banco' };

  it.each([
    [{ existe: false }, /no encontrado/],
    [{ estado: 'ANULADO' }, /ya está anulado/],
    [{ estado: 'REVERSADO' }, /reversado no puede anularse/],
    [{ aplicado: 10 }, /aplicaciones vigentes/],
    [{ anticipos: 1 }, /respalda un anticipo vigente/],
  ])('rechaza %o', async (o, mensaje) => {
    const { conn, ejecuto } = crearConexion(reglas(o));
    db.getConnection.mockResolvedValue(conn);
    await expect(pagos.anular(1, datos)).rejects.toThrow(mensaje);
    expect(ejecuto(/UPDATE CXC_PAGOS/)).toHaveLength(0);
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
  it('éxito: deja trazabilidad de quién, cuándo y por qué', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await pagos.anular(1, datos);
    expect(ejecuto(/SET ESTADO = 'ANULADO'/)[0].binds).toMatchObject({ idEmpleadoAnulacion: 5, motivoAnulacion: datos.motivoAnulacion, fechaAnulacion: null });
    expect(conn.commit).toHaveBeenCalledOnce();
  });
});

describe('pago.update / pago.remove', () => {
  const reglas = (o: { estado?: string; aplicado?: number; anticipos?: number } = {}): Regla[] => [
    { sql: /SELECT ESTADO FROM CXC_PAGOS WHERE ID_PAGO = :id FOR UPDATE/, rows: [{ ESTADO: o.estado ?? 'NO_APLICADO' }] },
    { sql: /FROM CXC_APLICACION_PAGOS/, rows: [{ TOTAL: o.aplicado ?? 0 }] },
    { sql: /FROM CXC_ANTICIPOS WHERE ID_PAGO/, rows: [{ TOTAL: o.anticipos ?? 0 }] },
  ];

  it('update sin campos no abre conexión', async () => {
    await pagos.update(1, {});
    expect(db.getConnection).not.toHaveBeenCalled();
  });
  it.each(['ANULADO', 'REVERSADO', 'APLICADO'])('update rechaza pago %s', async (estado) => {
    const { conn } = crearConexion(reglas({ estado }));
    db.getConnection.mockResolvedValue(conn);
    await expect(pagos.update(1, { monto: 10 })).rejects.toThrow(/no puede modificarse/);
  });
  it('update rechaza pago con aplicaciones', async () => {
    const { conn } = crearConexion(reglas({ aplicado: 1 }));
    db.getConnection.mockResolvedValue(conn);
    await expect(pagos.update(1, { monto: 10 })).rejects.toThrow(/ya tiene aplicaciones/);
  });
  it('update rechaza pago que respalda un anticipo', async () => {
    const { conn } = crearConexion(reglas({ anticipos: 1 }));
    db.getConnection.mockResolvedValue(conn);
    await expect(pagos.update(1, { monto: 10 })).rejects.toThrow(/respalda un anticipo/);
  });
  it('update válido escribe solo los campos enviados', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await pagos.update(1, { monto: 10, fechaPago: '2026-10-01', numeroReferencia: 'A-1' });
    const upd = ejecuto(/UPDATE CXC_PAGOS SET/)[0];
    expect(upd.sql).toContain("MONTO=:monto");
    expect(upd.sql).toContain("FECHA_PAGO=TO_DATE(:fechaPago,'YYYY-MM-DD')");
    expect(upd.sql).not.toContain('ID_CLIENTE');
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('remove solo borra pagos sin aplicar', async () => {
    let r = crearConexion(reglas({ estado: 'EN_CUENTA' }));
    db.getConnection.mockResolvedValue(r.conn);
    await expect(pagos.remove(1)).rejects.toThrow(/Solo pagos sin aplicar/);

    r = crearConexion(reglas({ anticipos: 1 }));
    db.getConnection.mockResolvedValue(r.conn);
    await expect(pagos.remove(1)).rejects.toThrow(/respalda un anticipo/);

    r = crearConexion(reglas());
    db.getConnection.mockResolvedValue(r.conn);
    await pagos.remove(1);
    expect(r.ejecuto(/DELETE FROM CXC_PAGOS/)).toHaveLength(1);
    expect(r.conn.commit).toHaveBeenCalledOnce();
  });
});
