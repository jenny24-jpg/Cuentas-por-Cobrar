import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion } from '../helpers/fakeOracle';
import { createPagoSchema } from '../../../packages/contracts/src/modules/cxc/pagos/pago';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as aplicaciones from '../../../server/src/modules/cxc/repositories/pagos/aplicacionPago.repository';
import * as anticipos from '../../../server/src/modules/cxc/repositories/pagos/anticipo.repository';
import * as pagos from '../../../server/src/modules/cxc/repositories/pagos/pago.repository';
import * as ajustes from '../../../server/src/modules/cxc/repositories/documentos/ajuste.repository';
import * as recibos from '../../../server/src/modules/cxc/repositories/pagos/recibo.repository';

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
  it('pago: disponible cae al monto cuando Oracle no lo calcula y las fechas conservan el día de Oracle', async () => {
    // Las fechas llegan como texto AAAA-MM-DD (TO_CHAR en Oracle) para no correrse por zona horaria.
    const { conn } = crearConexion([{ sql: /WHERE p.ID_PAGO\s*=\s*:id/, rows: [{ ID_PAGO: 1, MONTO: 80, MONTO_APLICADO: null, MONTO_DISPONIBLE: null, FECHA_PAGO_ISO: '2026-10-19', FECHA_ANULACION_ISO: '2026-10-20' }] }]);
    db.getConnection.mockResolvedValue(conn);
    expect(await pagos.findById(1)).toMatchObject({ montoAplicado: 0, montoDisponible: 80, fechaPago: '2026-10-19', fechaAnulacion: '2026-10-20' });
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
    let r = crearConexion([
      { sql: /INSERT INTO CXC_PAGOS/, outId: 12 },
      { sql: /SELECT MAX\(CASE WHEN REGEXP_LIKE\(NUMERO_REFERENCIA/, rows: [{ ULTIMO: 81 }] },
    ]);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(pagos.create({ idCliente: 1, idFormaPago: 1, idMoneda: 1, fechaPago: '2026-10-27', monto: 50 } as never)).resolves.toBe(12);
    // La referencia es el último correlativo del año + 1, calculado con CXC_PAGOS bloqueada antes del INSERT.
    const orden = r.ejecuciones.map((e) => e.sql);
    expect(orden[0]).toBe('LOCK TABLE CXC_PAGOS IN EXCLUSIVE MODE WAIT 5');
    expect(r.ejecuto(/SELECT MAX/)[0].binds).toEqual({ prefijo: 'PAG-2026-' });
    expect(r.ejecuto(/INSERT INTO CXC_PAGOS/)[0].binds).toMatchObject({ idBanco: null, estado: 'NO_APLICADO', numeroReferencia: 'PAG-2026-000082' });
    expect(r.ejecuto(/CXC_APLICACION_PAGOS/)).toHaveLength(0);
    expect(r.conn.commit).toHaveBeenCalledOnce();

    r = crearConexion([]);
    r.conn.execute.mockRejectedValueOnce(new Error('ORA-02291'));
    db.getConnection.mockResolvedValue(r.conn);
    await expect(pagos.create({ idCliente: 1, idFormaPago: 1, idMoneda: 1, fechaPago: '2026-10-27', monto: 50 } as never)).rejects.toThrow('ORA-02291');
    expect(r.conn.rollback).toHaveBeenCalledOnce();
    expect(r.conn.close).toHaveBeenCalledOnce();
  });
  describe('create con destino: el pago y su uso se registran en una sola transacción', () => {
    const reglasAplicacion = (saldo: number) => crearConexion([
      { sql: /INSERT INTO CXC_PAGOS/, outId: 12 },
      { sql: /INSERT INTO CXC_APLICACION_PAGOS/, outId: 5 },
      { sql: /INSERT INTO CXC_RECIBOS/, outId: 7 },
      { sql: /INSERT INTO CXC_ANTICIPOS/, outId: 30 },
      { sql: /SELECT MAX\(CASE WHEN REGEXP_LIKE\(NUMERO_REFERENCIA/, rows: [{ ULTIMO: 0 }] },
      { sql: /FROM CXC_PAGOS WHERE ID_PAGO = :idPago FOR UPDATE/, rows: [{ ID_PAGO: 12, ID_CLIENTE: 1, ID_MONEDA: 1, MONTO: 50, ESTADO: 'NO_APLICADO', FECHA_PAGO_ISO: '2026-10-27' }] },
      { sql: /SELECT ID_CLIENTE, MONTO, ESTADO FROM CXC_PAGOS/, rows: [{ ID_CLIENTE: 1, MONTO: 50, ESTADO: 'NO_APLICADO' }] },
      { sql: /FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO = :idDocumento FOR UPDATE/, rows: [{ ID_DOCUMENTO: 9, ID_CLIENTE: 1, ID_MONEDA: 1, TOTAL: 200, SALDO: saldo, ESTADO: 'PENDIENTE' }] },
      { sql: /SUM\(MONTO_APLICADO\)/, rows: [{ TOTAL: 0 }] },
      { sql: /COUNT\(\*\)/, rows: [{ TOTAL: 0 }] },
    ]);
    const nuevoPago = { idCliente: 1, idFormaPago: 1, idMoneda: 1, fechaPago: '2026-10-27', monto: 50 } as never;

    it('una factura: aplica, baja el saldo y emite el recibo', async () => {
      const r = reglasAplicacion(200);
      db.getConnection.mockResolvedValue(r.conn);
      await expect(pagos.create(nuevoPago, { aplicaciones: [{ idDocumento: 9, montoAplicado: 50 }], idEmpleado: 3 })).resolves.toBe(12);
      expect(r.ejecuto(/INSERT INTO CXC_APLICACION_PAGOS/)[0].binds).toMatchObject({ idPago: 12, idDocumento: 9, montoAplicado: 50, idEmpleado: 3, fechaAplicacion: '2026-10-27' });
      expect(r.ejecuto(/UPDATE CXC_DOCUMENTOS/)[0].binds).toMatchObject({ saldo: 150, idDocumento: 9 });
      expect(r.ejecuto(/INSERT INTO CXC_RECIBOS/)).toHaveLength(1);
      expect(r.ejecuto(/INSERT INTO CXC_ANTICIPOS/)).toHaveLength(0);
      expect(r.conn.commit).toHaveBeenCalledOnce();
    });

    it('varias facturas: una aplicación y un recibo por cada una, en orden de documento', async () => {
      const r = reglasAplicacion(200);
      db.getConnection.mockResolvedValue(r.conn);
      await pagos.create(nuevoPago, {
        aplicaciones: [{ idDocumento: 9, montoAplicado: 30 }, { idDocumento: 4, montoAplicado: 20 }],
        idEmpleado: 3,
      });
      expect(r.ejecuto(/INSERT INTO CXC_APLICACION_PAGOS/).map((e) => e.binds.idDocumento)).toEqual([4, 9]);
      expect(r.ejecuto(/INSERT INTO CXC_RECIBOS/)).toHaveLength(2);
      expect(r.conn.commit).toHaveBeenCalledOnce();
    });

    it('anticipo: crea el anticipo por el monto del pago en la misma transacción', async () => {
      const r = reglasAplicacion(200);
      db.getConnection.mockResolvedValue(r.conn);
      await pagos.create(nuevoPago, { comoAnticipo: true });
      expect(r.ejecuto(/INSERT INTO CXC_ANTICIPOS/)[0].binds).toMatchObject({ idCliente: 1, idPago: 12, montoOriginal: 50, montoDisponible: 50 });
      expect(r.ejecuto(/INSERT INTO CXC_APLICACION_PAGOS/)).toHaveLength(0);
      expect(r.conn.commit).toHaveBeenCalledOnce();
    });

    it('si una aplicación falla no queda nada: ni el pago ni las aplicaciones anteriores', async () => {
      const r = reglasAplicacion(30);
      db.getConnection.mockResolvedValue(r.conn);
      await expect(pagos.create(nuevoPago, { aplicaciones: [{ idDocumento: 9, montoAplicado: 50 }], idEmpleado: 3 })).rejects.toThrow(/saldo del documento/);
      expect(r.conn.commit).not.toHaveBeenCalled();
      expect(r.conn.rollback).toHaveBeenCalledOnce();
    });
  });
  it('createPagoSchema: la suma aplicada debe igualar el monto, sin documentos repetidos ni anticipo a la vez', () => {
    const base = { idCliente: 1, idFormaPago: 1, idMoneda: 1, fechaPago: '2026-10-27', monto: 50 };
    expect(createPagoSchema.safeParse({ ...base, aplicaciones: [{ idDocumento: 1, montoAplicado: 30 }, { idDocumento: 2, montoAplicado: 20 }] }).success).toBe(true);
    expect(createPagoSchema.safeParse({ ...base, aplicaciones: [{ idDocumento: 1, montoAplicado: 30 }] }).success).toBe(false);
    expect(createPagoSchema.safeParse({ ...base, aplicaciones: [{ idDocumento: 1, montoAplicado: 25 }, { idDocumento: 1, montoAplicado: 25 }] }).success).toBe(false);
    expect(createPagoSchema.safeParse({ ...base, aplicaciones: [{ idDocumento: 1, montoAplicado: 50 }], comoAnticipo: true }).success).toBe(false);
    expect(createPagoSchema.safeParse({ ...base, comoAnticipo: true }).success).toBe(true);
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
    expect(r.ejecuciones[0].sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM CXC_APLICACION_PAGOS/);
    expect(r.ejecuciones[0].sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM CXC_ANTICIPOS/);
  });
});

// ---------------------------------------------------------------------------
// Recibo manual: número y monto los pone el sistema; el mismo dinero no tiene dos recibos.
// ---------------------------------------------------------------------------
describe('recibo.create manual', () => {
  const reglas = (montoPago: number, emitidos: number) => crearConexion([
    { sql: /SELECT MONTO FROM CXC_PAGOS WHERE ID_PAGO = :idPago FOR UPDATE/, rows: [{ MONTO: montoPago }] },
    { sql: /FROM CXC_RECIBOS WHERE ID_PAGO = :idPago AND TRIM\(ESTADO\) = 'EMITIDO'/, rows: [{ TOTAL: emitidos }] },
    { sql: /SELECT MAX\(CASE WHEN REGEXP_LIKE\(NUMERO_RECIBO/, rows: [{ ULTIMO: 88 }] },
    { sql: /INSERT INTO CXC_RECIBOS/, outId: 90 },
  ]);
  const datos = { idCliente: 1, idPago: 5, fecha: '2026-10-27', estado: 'EMITIDO' } as const;

  it('el monto es lo que al pago le falta respaldar y el número es el siguiente del año', async () => {
    const r = reglas(500, 200);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(recibos.create(datos)).resolves.toBe(90);
    expect(r.ejecuto(/LOCK TABLE CXC_RECIBOS IN EXCLUSIVE MODE WAIT 5/)).toHaveLength(1);
    expect(r.ejecuto(/INSERT INTO CXC_RECIBOS/)[0].binds).toMatchObject({ monto: 300, numeroRecibo: 'REC-2026-000089', idPago: 5 });
    expect(r.conn.commit).toHaveBeenCalledOnce();
  });

  it('un pago ya cubierto por recibos no admite otro', async () => {
    const r = reglas(500, 500);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(recibos.create(datos)).rejects.toThrow(/ya tiene recibos por todo su monto/);
    expect(r.ejecuto(/INSERT INTO CXC_RECIBOS/)).toHaveLength(0);
    expect(r.conn.rollback).toHaveBeenCalledOnce();
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
  it('update: historial previo, fecha inmutable y pago obligatorio', async () => {
    let r = crearConexion([bloqueo(), { sql: /FROM CXC_APLICACION_ANTICIPO/, rows: [{ TOTAL: 2 }] }]);
    db.getConnection.mockResolvedValue(r.conn);
    await expect(anticipos.update(1, { idCliente: 1 })).rejects.toThrow(/ya tiene historial/);

    r = crearConexion([bloqueo(), { sql: /FROM CXC_APLICACION_ANTICIPO/, rows: [{ TOTAL: 0 }] }]);
    db.getConnection.mockResolvedValue(r.conn);
    // La fecha de un anticipo registrado nunca cambia.
    await expect(anticipos.update(1, { fecha: '2026-10-21' })).rejects.toThrow(/fecha de un anticipo registrado no puede modificarse/);
    // Sin pago que lo respalde ya no se acepta: el monto sale del pago.
    await expect(anticipos.update(1, { idCliente: 1 })).rejects.toThrow(/pago que respalda/);
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
