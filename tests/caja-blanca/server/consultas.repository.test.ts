import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as aplicaciones from '../../../server/src/modules/cxc/repositories/pagos/aplicacionPago.repository';
import * as anticipos from '../../../server/src/modules/cxc/repositories/pagos/anticipo.repository';
import * as pagos from '../../../server/src/modules/cxc/repositories/pagos/pago.repository';
import * as ajustes from '../../../server/src/modules/cxc/repositories/documentos/ajuste.repository';

const FECHA = new Date('2026-10-20T06:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

/**
 * Listados: con búsqueda el filtro viaja como bind (%texto%), nunca concatenado;
 * sin búsqueda no hay WHERE. El conteo usa el mismo filtro que los datos.
 */
describe.each([
  ['aplicacionPago', aplicaciones.findAll, { ID_APLICACION: 1, ID_PAGO: 2, ID_DOCUMENTO: 3, SERIE_DOCUMENTO: 'A', NUMERO_DOCUMENTO: '10', FECHA_APLICACION: FECHA, FECHA_REVERSA: null }],
  ['anticipo', anticipos.findAll, { ID_ANTICIPO: 1, FECHA: FECHA, FECHA_ANULACION: null }],
  ['pago', pagos.findAll, { ID_PAGO: 1, MONTO: 100, MONTO_APLICADO: null, MONTO_DISPONIBLE: null, FECHA_PAGO: FECHA, FECHA_ANULACION: null }],
  ['ajuste', ajustes.findAll, { ID_AJUSTE: 1, FECHA: FECHA }],
] as const)('%s.findAll', (_nombre, findAll, fila) => {
  it('con búsqueda: bind parametrizado, paginación y total', async () => {
    const { conn, ejecuciones } = crearConexion([
      { sql: /COUNT\(\*\)/, rows: [{ TOTAL: 31 }] },
      { sql: /OFFSET/, rows: [fila] },
    ]);
    db.getConnection.mockResolvedValue(conn);
    const r = await findAll({ page: 3, limit: 10, search: "x' OR 1=1 --" });
    expect(r.total).toBe(31);
    expect(r.data).toHaveLength(1);
    const [datos, conteo] = ejecuciones;
    expect(datos.sql).toContain('LIKE');
    expect(datos.sql).not.toContain('OR 1=1');
    expect(datos.binds).toMatchObject({ search: "%x' OR 1=1 --%", offset: 20, limit: 10 });
    expect(conteo.binds).toEqual({ search: "%x' OR 1=1 --%" });
    expect(conn.close).toHaveBeenCalledOnce();
  });
  it('sin búsqueda: sin WHERE y total 0 si Oracle no devuelve filas', async () => {
    const { conn, ejecuciones } = crearConexion([]);
    db.getConnection.mockResolvedValue(conn);
    const r = await findAll({ page: 1, limit: 5 });
    expect(r).toEqual({ data: [], total: 0 });
    expect(ejecuciones[1].sql).not.toContain('WHERE');
    expect(ejecuciones[0].binds).toEqual({ offset: 0, limit: 5 });
  });
});

describe('mapeo de filas', () => {
  it('aplicación: referencia de documento armada o de respaldo y fechas ISO', async () => {
    const { conn } = crearConexion([{ sql: /WHERE a.ID_APLICACION = :id/, rows: [{ ID_APLICACION: 1, ID_DOCUMENTO: 3, SERIE_DOCUMENTO: null, NUMERO_DOCUMENTO: null, FECHA_APLICACION: FECHA, FECHA_REVERSA: FECHA }] }]);
    db.getConnection.mockResolvedValue(conn);
    expect(await aplicaciones.findById(1)).toMatchObject({ referenciaDocumento: 'Documento #3', fechaAplicacion: FECHA.toISOString(), fechaReversa: FECHA.toISOString() });
  });
  it('pago: disponible cae al monto cuando Oracle no lo calcula', async () => {
    const { conn } = crearConexion([{ sql: /WHERE p.ID_PAGO=:id/, rows: [{ ID_PAGO: 1, MONTO: 80, MONTO_APLICADO: null, MONTO_DISPONIBLE: null, FECHA_PAGO: FECHA, FECHA_ANULACION: FECHA }] }]);
    db.getConnection.mockResolvedValue(conn);
    expect(await pagos.findById(1)).toMatchObject({ montoAplicado: 0, montoDisponible: 80, fechaAnulacion: FECHA.toISOString() });
  });
  it.each([
    ['aplicacionPago', aplicaciones.findById],
    ['anticipo', anticipos.findById],
    ['pago', pagos.findById],
    ['ajuste', ajustes.findById],
  ] as const)('%s.findById sin fila → null', async (_n, findById) => {
    const { conn } = crearConexion([]);
    db.getConnection.mockResolvedValue(conn);
    expect(await findById(99)).toBeNull();
    expect(conn.close).toHaveBeenCalledOnce();
  });
});

describe('pago.create / pago.listOptions', () => {
  it('create: valores por defecto, referencia automática y rollback si Oracle falla', async () => {
    let r = crearConexion([{ sql: /INSERT INTO CXC_PAGOS/, outId: 12 }]);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(pagos.create({ idCliente: 1, idFormaPago: 1, idMoneda: 1, fechaPago: '2026-10-27', monto: 50 } as never)).resolves.toBe(12);
    expect(r.ejecuciones[0].binds).toMatchObject({ idBanco: null, estado: 'NO_APLICADO' });
    // La referencia la asigna el sistema (PAG-AAAA-000012) dentro de la misma transacción.
    const correlativo = r.ejecuto(/UPDATE CXC_PAGOS\s+SET NUMERO_REFERENCIA = 'PAG-'/);
    expect(correlativo).toHaveLength(1);
    expect(correlativo[0].binds).toEqual({ id: 12 });
    expect(r.conn.commit).toHaveBeenCalledOnce();

    r = crearConexion([]);
    r.conn.execute.mockRejectedValueOnce(new Error('ORA-02291'));
    db.getConnection.mockResolvedValue(r.conn);
    await expect(pagos.create({ idCliente: 1, idFormaPago: 1, idMoneda: 1, fechaPago: '2026-10-27', monto: 50 } as never)).rejects.toThrow('ORA-02291');
    expect(r.conn.rollback).toHaveBeenCalledOnce();
    expect(r.conn.close).toHaveBeenCalledOnce();
  });
  it('listOptions filtra por cliente solo si se indica y arma la etiqueta con cliente, fecha y forma', async () => {
    let r = crearConexion([{ sql: /GROUP BY/, rows: [{ ID_PAGO: 4, ID_CLIENTE: 1, CLIENTE: 'CR-00001 Ana', NUMERO_REFERENCIA: 'PAG-2026-000004', FORMA_PAGO: 'Efectivo', FECHA: '27/10/2026', MONTO: 100, DISPONIBLE: 25.5, ESTADO: 'EN_CUENTA' }] }]);
    db.getConnection.mockResolvedValue(r.conn);
    const [op] = await pagos.listOptions(1);
    expect(op).toMatchObject({ id: 4, idCliente: 1, cliente: 'CR-00001 Ana', saldo: 25.5, label: 'PAG-2026-000004 · 27/10/2026 · Efectivo · disponible Q 25.50' });
    expect(r.ejecuciones[0].binds).toEqual({ idCliente: 1 });
    expect(r.ejecuciones[0].sql).not.toContain('NOT EXISTS');

    r = crearConexion([{ sql: /GROUP BY/, rows: [{ ID_PAGO: 5, NUMERO_REFERENCIA: null, FORMA_PAGO: null, FECHA: '01/10/2026', MONTO: 1, DISPONIBLE: 1 }] }]);
    db.getConnection.mockResolvedValue(r.conn);
    expect((await pagos.listOptions())[0].label).toBe('Pago #5 · 01/10/2026 · disponible Q 1.00');
    expect(r.ejecuciones[0].sql).not.toContain('p.ID_CLIENTE = :idCliente');
  });
  it('listOptions paraAnticipo excluye pagos aplicados o que ya respaldan un anticipo', async () => {
    const r = crearConexion([{ sql: /GROUP BY/, rows: [] }]);
    db.getConnection.mockResolvedValue(r.conn);
    await pagos.listOptions(1, { paraAnticipo: true });
    expect(r.ejecuciones[0].sql).toMatch(/NOT EXISTS \(SELECT 1 FROM CXC_APLICACION_PAGOS/);
    expect(r.ejecuciones[0].sql).toMatch(/NOT EXISTS \(SELECT 1 FROM CXC_ANTICIPOS/);
  });
});

describe('anticipo.remove / anticipo.anular', () => {
  const bloqueo = (extra: Record<string, unknown> = {}) => ({
    sql: /FROM CXC_ANTICIPOS WHERE ID_ANTICIPO = :id FOR UPDATE/,
    rows: [{ ID_CLIENTE: 1, ID_PAGO: null, ESTADO: 'DISPONIBLE', MONTO_ORIGINAL: 10, MONTO_DISPONIBLE: 10, FECHA_ISO: '2026-10-20', ...extra }],
  });

  it('remove: solo disponibles y sin historial', async () => {
    let r = crearConexion([bloqueo({ ESTADO: 'APLICADO' })]);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(anticipos.remove(1)).rejects.toThrow(/Solo se puede eliminar/);

    r = crearConexion([bloqueo(), { sql: /FROM CXC_APLICACION_ANTICIPO/, rows: [{ TOTAL: 1 }] }]);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(anticipos.remove(1)).rejects.toThrow(/historial de aplicaciones/);

    r = crearConexion([bloqueo(), { sql: /FROM CXC_APLICACION_ANTICIPO/, rows: [{ TOTAL: 0 }] }]);
    db.getConnection.mockResolvedValue(r.conn);
    await anticipos.remove(1);
    expect(r.ejecuto(/DELETE FROM CXC_ANTICIPOS/)).toHaveLength(1);
  });
  it('update: historial previo y fecha futura', async () => {
    let r = crearConexion([bloqueo(), { sql: /FROM CXC_APLICACION_ANTICIPO/, rows: [{ TOTAL: 2 }] }]);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(anticipos.update(1, { fecha: '2026-10-21' })).rejects.toThrow(/ya tiene historial/);

    r = crearConexion([bloqueo(), { sql: /FROM CXC_APLICACION_ANTICIPO/, rows: [{ TOTAL: 0 }] }]);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(anticipos.update(1, { fecha: '2026-10-28' })).rejects.toThrow(/futura/);
    // Sin pago que lo respalde ya no se acepta: el monto sale del pago.
    await expect(anticipos.update(1, { fecha: '2026-10-21' })).rejects.toThrow(/pago que respalda/);
  });
  it('anular: ya cancelado, aplicaciones vigentes, fechas y éxito', async () => {
    const datos = { idEmpleadoAnulacion: 5, motivoAnulacion: 'Cliente solicitó devolución' };
    let r = crearConexion([bloqueo({ ESTADO: 'CANCELADO' })]);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(anticipos.anular(1, datos)).rejects.toThrow(/ya está anulado/);

    const conAplicado = (total: number) => crearConexion([bloqueo(), { sql: /SUM\(MONTO_APLICADO\)/, rows: [{ TOTAL: total }] }]);
    r = conAplicado(5);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(anticipos.anular(1, datos)).rejects.toThrow(/aplicaciones vigentes/);

    r = conAplicado(0);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(anticipos.anular(1, { ...datos, fechaAnulacion: '2026-10-28' })).rejects.toThrow(/futura/);
    await expect(anticipos.anular(1, { ...datos, fechaAnulacion: '2026-10-19' })).rejects.toThrow(/anterior a la fecha del anticipo/);

    await anticipos.anular(1, datos);
    expect(r.ejecuto(/ESTADO = 'CANCELADO'/)[0].binds).toMatchObject({ fechaAnulacion: '2026-10-27', idEmpleadoAnulacion: 5 });
  });
});

describe('ajuste.create / update / remove', () => {
  it('create normaliza opcionales a null', async () => {
    const r = crearConexion([{ sql: /INSERT INTO CXC_AJUSTES/, outId: 3 }]);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(ajustes.create({ idCliente: 1, tipoAjuste: 'CREDITO', monto: 5, idEmpleado: 2 } as never)).resolves.toBe(3);
    expect(r.ejecuciones[0].binds).toMatchObject({ idDocumento: null, motivo: null, fecha: null });
  });
  it('update arma solo los campos enviados; sin campos no conecta', async () => {
    await ajustes.update(1, {});
    expect(db.getConnection).not.toHaveBeenCalled();

    const r = crearConexion([]);
    db.getConnection.mockResolvedValue(r.conn);
    await ajustes.update(1, { idCliente: 1, idDocumento: 2, tipoAjuste: 'DEBITO', monto: 3, motivo: 'x', fecha: '2026-10-01', idEmpleado: 4 } as never);
    expect(r.ejecuciones[0].sql).toContain("FECHA = TO_DATE(:fecha, 'YYYY-MM-DD')");
    expect(Object.keys(r.ejecuciones[0].binds)).toHaveLength(8);
  });
  it('errores de Oracle hacen rollback en create, update y remove', async () => {
    for (const op of [
      () => ajustes.create({ idCliente: 1, tipoAjuste: 'CREDITO', monto: 5, idEmpleado: 2 } as never),
      () => ajustes.update(1, { monto: 1 }),
      () => ajustes.remove(1),
    ]) {
      const r = crearConexion([]);
      r.conn.execute.mockRejectedValueOnce(new Error('ORA-00060'));
      db.getConnection.mockResolvedValue(r.conn);
      await expect(op()).rejects.toThrow('ORA-00060');
      expect(r.conn.rollback).toHaveBeenCalledOnce();
      expect(r.conn.close).toHaveBeenCalledOnce();
    }
  });
});
