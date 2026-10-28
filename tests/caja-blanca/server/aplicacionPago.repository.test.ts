import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
const historial = vi.hoisted(() => ({ registrarEvento: vi.fn(async () => undefined) }));
const recibos = vi.hoisted(() => ({ crearReciboAutomatico: vi.fn(async () => 99) }));
vi.mock('../../../server/src/config/database', () => db);
vi.mock('../../../server/src/modules/cxc/repositories/documentos/documentoHistorial.repository', () => historial);
vi.mock('../../../server/src/modules/cxc/repositories/pagos/recibo.repository', () => recibos);

import { create, reversar } from '../../../server/src/modules/cxc/repositories/pagos/aplicacionPago.repository';

const HOY = '2026-10-27';
const input = (extra: Record<string, unknown> = {}) => ({
  idPago: 1, idDocumento: 2, fechaAplicacion: HOY, montoAplicado: 40, idEmpleado: 5, ...extra,
}) as Parameters<typeof create>[0];

const pago = (extra: Record<string, unknown> = {}) => ({ ID_PAGO: 1, ID_CLIENTE: 10, ID_MONEDA: 1, MONTO: 100, ESTADO: 'NO_APLICADO', FECHA_PAGO_ISO: '2026-10-01', ...extra });
const documento = (extra: Record<string, unknown> = {}) => ({ ID_DOCUMENTO: 2, ID_CLIENTE: 10, ID_MONEDA: 1, TOTAL: 100, SALDO: 100, ESTADO: 'PENDIENTE', ...extra });

function reglasCreate(o: { pago?: unknown[]; documento?: unknown[]; anticipos?: unknown[]; aplicado?: number } = {}): Regla[] {
  return [
    { sql: /FROM CXC_PAGOS WHERE ID_PAGO = :idPago FOR UPDATE/, rows: o.pago ?? [pago()] },
    { sql: /FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO = :idDocumento FOR UPDATE/, rows: o.documento ?? [documento()] },
    { sql: /FROM CXC_ANTICIPOS WHERE ID_PAGO/, rows: o.anticipos ?? [] },
    { sql: /SUM\(MONTO_APLICADO\), 0\) TOTAL FROM CXC_APLICACION_PAGOS WHERE ID_PAGO/, rows: [{ TOTAL: o.aplicado ?? 0 }] },
    { sql: /INSERT INTO CXC_APLICACION_PAGOS/, outId: 500 },
  ];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('aplicacionPago.create — validaciones (cada una hace rollback y cierra)', () => {
  async function esperaError(reglas: Regla[], datos: ReturnType<typeof input>, mensaje: RegExp) {
    const { conn } = crearConexion(reglas);
    db.getConnection.mockResolvedValue(conn);
    await expect(create(datos)).rejects.toThrow(mensaje);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.close).toHaveBeenCalledOnce();
  }

  it('fecha futura se rechaza antes de pedir conexión', async () => {
    await expect(create(input({ fechaAplicacion: '2026-10-28' }))).rejects.toThrow(/futura/);
    expect(db.getConnection).not.toHaveBeenCalled();
  });
  it('pago inexistente', () => esperaError(reglasCreate({ pago: [] }), input(), /pago seleccionado no existe/));
  it('aplicación anterior a la fecha del pago', () =>
    esperaError(reglasCreate({ pago: [pago({ FECHA_PAGO_ISO: '2026-10-27' })] }), input({ fechaAplicacion: '2026-10-26' }), /anterior a la fecha del pago/));
  it('documento inexistente', () => esperaError(reglasCreate({ documento: [] }), input(), /documento seleccionado no existe/));
  it.each(['ANULADO', 'REVERSADO'])('pago %s', (estado) =>
    esperaError(reglasCreate({ pago: [pago({ ESTADO: estado })] }), input(), /anulado o reversado/));
  it('documento pagado', () => esperaError(reglasCreate({ documento: [documento({ ESTADO: 'PAGADO' })] }), input(), /pagado\/anulado/));
  it('documento sin saldo', () => esperaError(reglasCreate({ documento: [documento({ SALDO: 0 })] }), input(), /no tiene saldo/));
  it('clientes distintos', () => esperaError(reglasCreate({ documento: [documento({ ID_CLIENTE: 11 })] }), input(), /mismo cliente/));
  it('monedas distintas', () => esperaError(reglasCreate({ documento: [documento({ ID_MONEDA: 2 })] }), input(), /misma moneda/));
  it('pago reservado como anticipo', () => esperaError(reglasCreate({ anticipos: [{ ID_ANTICIPO: 3 }] }), input(), /reservado como anticipo/));
  it('monto cero', () => esperaError(reglasCreate(), input({ montoAplicado: 0 }), /mayor a cero/));
  it('monto mayor al saldo del documento', () =>
    esperaError(reglasCreate({ documento: [documento({ SALDO: 30 })] }), input({ montoAplicado: 30.01 }), /saldo del documento/));
  it('monto mayor al disponible del pago', () =>
    esperaError(reglasCreate({ aplicado: 70 }), input({ montoAplicado: 30.01 }), /disponible del pago/));
});

describe('aplicacionPago.create — caminos exitosos', () => {
  it('pago parcial: documento PARCIAL, pago EN_CUENTA, recibo e historial en la misma transacción', async () => {
    const { conn, ejecuto } = crearConexion(reglasCreate());
    db.getConnection.mockResolvedValue(conn);

    await expect(create(input({ montoAplicado: 40 }))).resolves.toBe(500);

    expect(ejecuto(/UPDATE CXC_DOCUMENTOS/)[0].binds).toMatchObject({ saldo: 60, estado: 'PARCIAL' });
    expect(ejecuto(/UPDATE CXC_PAGOS/)[0].binds).toMatchObject({ estado: 'EN_CUENTA' });
    expect(historial.registrarEvento).toHaveBeenCalledWith(conn, expect.objectContaining({ tipoEvento: 'APLICACION_PAGO', monto: 40, naturaleza: 'ABONO' }));
    expect(recibos.crearReciboAutomatico).toHaveBeenCalledWith(conn, { idCliente: 10, idPago: 1, fecha: HOY, monto: 40 });
    expect(conn.commit).toHaveBeenCalledOnce();
    expect(conn.rollback).not.toHaveBeenCalled();
  });
  it('pago total: documento PAGADO y pago APLICADO (tolerancia de centavos)', async () => {
    const { conn, ejecuto } = crearConexion(reglasCreate({ aplicado: 0 }));
    db.getConnection.mockResolvedValue(conn);
    await create(input({ montoAplicado: 100 }));
    expect(ejecuto(/UPDATE CXC_DOCUMENTOS/)[0].binds).toMatchObject({ saldo: 0, estado: 'PAGADO' });
    expect(ejecuto(/UPDATE CXC_PAGOS/)[0].binds).toMatchObject({ estado: 'APLICADO' });
  });
});

describe('aplicacionPago.create — cobro desde ruta', () => {
  const ruta = (o: { estadoRuta?: string; asignacion?: unknown[]; anterior?: unknown[]; aplicadoRuta?: number } = {}): Regla[] => [
    { sql: /SELECT ID_RUTA FROM CXC_RUTA_DETALLE/, rows: [{ ID_RUTA: 7 }] },
    { sql: /SELECT ESTADO FROM CXC_RUTAS/, rows: [{ ESTADO: o.estadoRuta ?? 'PLANIFICADA' }] },
    { sql: /SELECT ID_DOCUMENTO,MONTO_ASIGNADO FROM CXC_RUTA_DETALLE/, rows: o.asignacion ?? [{ ID_DOCUMENTO: 2, MONTO_ASIGNADO: 50 }] },
    { sql: /WHERE CLAVE_RUTA=:clave/, rows: o.anterior ?? [] },
    { sql: /WHERE ID_RUTA_DETALLE=:id AND ESTADO='CONFIRMADA'/, rows: [{ TOTAL: o.aplicadoRuta ?? 0 }] },
    ...reglasCreate(),
  ];
  const deRuta = (extra: Record<string, unknown> = {}) => input({ idRutaDetalle: 9, claveRuta: 'k-1', ...extra });

  it('asignación inexistente', async () => {
    const { conn } = crearConexion([{ sql: /SELECT ID_RUTA FROM CXC_RUTA_DETALLE/, rows: [] }]);
    db.getConnection.mockResolvedValue(conn);
    await expect(create(deRuta())).rejects.toThrow(/Asignación no encontrada/);
  });
  it('documento distinto al asignado', async () => {
    const { conn } = crearConexion(ruta({ asignacion: [{ ID_DOCUMENTO: 3, MONTO_ASIGNADO: 50 }] }));
    db.getConnection.mockResolvedValue(conn);
    await expect(create(deRuta())).rejects.toThrow(/no coincide con la asignación/);
  });
  it('reintento con la misma clave y mismos datos devuelve la aplicación previa sin duplicar', async () => {
    const previa = { ID_APLICACION: 77, ID_PAGO: 1, ID_DOCUMENTO: 2, ID_RUTA_DETALLE: 9, MONTO_APLICADO: 40, ID_EMPLEADO: 5, FECHA: HOY };
    const { conn, ejecuto } = crearConexion(ruta({ anterior: [previa] }));
    db.getConnection.mockResolvedValue(conn);
    await expect(create(deRuta())).resolves.toBe(77);
    expect(ejecuto(/INSERT INTO CXC_APLICACION_PAGOS/)).toHaveLength(0);
    expect(recibos.crearReciboAutomatico).not.toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('misma clave con otros datos es conflicto', async () => {
    const previa = { ID_APLICACION: 77, ID_PAGO: 1, ID_DOCUMENTO: 2, ID_RUTA_DETALLE: 9, MONTO_APLICADO: 39, ID_EMPLEADO: 5, FECHA: HOY };
    const { conn } = crearConexion(ruta({ anterior: [previa] }));
    db.getConnection.mockResolvedValue(conn);
    await expect(create(deRuta())).rejects.toThrow(/clave de operación ya fue utilizada/);
  });
  it.each(['COMPLETADA', 'CANCELADA'])('ruta %s está cerrada', async (estadoRuta) => {
    const { conn } = crearConexion(ruta({ estadoRuta }));
    db.getConnection.mockResolvedValue(conn);
    await expect(create(deRuta())).rejects.toThrow(/ruta está cerrada/);
  });
  it('supera el monto asignado restante', async () => {
    const { conn } = crearConexion(ruta({ aplicadoRuta: 20 }));
    db.getConnection.mockResolvedValue(conn);
    await expect(create(deRuta({ montoAplicado: 30.01 }))).rejects.toThrow(/supera el monto asignado/);
  });
  it('primer cobro pone la ruta EN_PROCESO dentro de la misma transacción', async () => {
    const { conn, ejecuto } = crearConexion(ruta());
    db.getConnection.mockResolvedValue(conn);
    await create(deRuta());
    expect(ejecuto(/UPDATE CXC_RUTAS SET ESTADO='EN_PROCESO'/)).toHaveLength(1);
    expect(ejecuto(/INSERT INTO CXC_APLICACION_PAGOS/)[0].binds).toMatchObject({ idRutaDetalle: 9, claveRuta: 'k-1' });
  });
});

describe('aplicacionPago.reversar', () => {
  const aplicacion = (extra: Record<string, unknown> = {}) => ({ ID_APLICACION: 500, ID_PAGO: 1, ID_DOCUMENTO: 2, MONTO_APLICADO: 40, ESTADO: 'CONFIRMADA', FECHA_APLICACION_ISO: '2026-10-20', ...extra });
  const reglas = (o: { aplicacion?: unknown[]; documento?: unknown[]; restante?: number; recibo?: unknown[]; pagoEstado?: string } = {}): Regla[] => [
    { sql: /FROM CXC_APLICACION_PAGOS WHERE ID_APLICACION = :id FOR UPDATE/, rows: o.aplicacion ?? [aplicacion()] },
    { sql: /FROM CXC_PAGOS WHERE ID_PAGO = :idPago FOR UPDATE/, rows: [pago({ ESTADO: o.pagoEstado ?? 'EN_CUENTA' })] },
    { sql: /FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO = :idDocumento FOR UPDATE/, rows: o.documento ?? [documento({ SALDO: 60, ESTADO: 'PARCIAL' })] },
    { sql: /AND ID_APLICACION <> :id/, rows: [{ TOTAL: o.restante ?? 0 }] },
    { sql: /SELECT ID_RECIBO FROM CXC_RECIBOS/, rows: o.recibo ?? [{ ID_RECIBO: 31 }] },
  ];
  const datos = { idEmpleadoReversa: 6, motivoReversa: 'Pago aplicado al documento equivocado', fechaReversa: HOY };

  it('fecha futura', async () => {
    await expect(reversar(500, { ...datos, fechaReversa: '2026-10-28' })).rejects.toThrow(/futura/);
  });
  it('aplicación inexistente', async () => {
    const { conn } = crearConexion(reglas({ aplicacion: [] }));
    db.getConnection.mockResolvedValue(conn);
    await expect(reversar(500, datos)).rejects.toThrow(/no encontrada/);
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
  it('ya reversada', async () => {
    const { conn } = crearConexion(reglas({ aplicacion: [aplicacion({ ESTADO: 'REVERSADA' })] }));
    db.getConnection.mockResolvedValue(conn);
    await expect(reversar(500, datos)).rejects.toThrow(/ya fue reversada/);
  });
  it('fecha de reversa anterior a la aplicación', async () => {
    const { conn } = crearConexion(reglas({ aplicacion: [aplicacion({ FECHA_APLICACION_ISO: '2026-10-27' })] }));
    db.getConnection.mockResolvedValue(conn);
    await expect(reversar(500, { ...datos, fechaReversa: '2026-10-26' })).rejects.toThrow(/anterior a la fecha de aplicación/);
  });
  it('documento anulado', async () => {
    const { conn } = crearConexion(reglas({ documento: [documento({ ESTADO: 'ANULADO' })] }));
    db.getConnection.mockResolvedValue(conn);
    await expect(reversar(500, datos)).rejects.toThrow(/documento anulado/);
  });
  it('devuelve el saldo, recalcula el pago y CANCELA el recibo automático', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await reversar(500, datos);

    expect(ejecuto(/UPDATE CXC_DOCUMENTOS/)[0].binds).toMatchObject({ saldo: 100, estado: 'PENDIENTE' });
    expect(ejecuto(/UPDATE CXC_PAGOS/)[0].binds).toMatchObject({ estado: 'NO_APLICADO' });
    expect(ejecuto(/SELECT ID_RECIBO FROM CXC_RECIBOS/)[0].binds).toEqual({ idPago: 1, monto: 40, fecha: '2026-10-20' });
    expect(ejecuto(/UPDATE CXC_RECIBOS SET ESTADO = 'CANCELADO'/)[0].binds).toEqual({ idRecibo: 31 });
    expect(historial.registrarEvento).toHaveBeenCalledWith(conn, expect.objectContaining({ tipoEvento: 'REVERSA_APLICACION_PAGO', naturaleza: 'CARGO' }));
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('quedan otras aplicaciones: pago EN_CUENTA o APLICADO según lo restante', async () => {
    let r = crearConexion(reglas({ restante: 30 }));
    db.getConnection.mockResolvedValue(r.conn);
    await reversar(500, datos);
    expect(r.ejecuto(/UPDATE CXC_PAGOS/)[0].binds).toMatchObject({ estado: 'EN_CUENTA' });

    r = crearConexion(reglas({ restante: 100 }));
    db.getConnection.mockResolvedValue(r.conn);
    await reversar(500, datos);
    expect(r.ejecuto(/UPDATE CXC_PAGOS/)[0].binds).toMatchObject({ estado: 'APLICADO' });
  });
  it('un pago ANULADO conserva su estado', async () => {
    const { conn, ejecuto } = crearConexion(reglas({ pagoEstado: 'ANULADO' }));
    db.getConnection.mockResolvedValue(conn);
    await reversar(500, datos);
    expect(ejecuto(/UPDATE CXC_PAGOS/)[0].binds).toMatchObject({ estado: 'ANULADO' });
  });
  it('si no hay recibo emitido (datos antiguos) la reversa continúa', async () => {
    const { conn, ejecuto } = crearConexion(reglas({ recibo: [] }));
    db.getConnection.mockResolvedValue(conn);
    await reversar(500, datos);
    expect(ejecuto(/UPDATE CXC_RECIBOS/)).toHaveLength(0);
    expect(conn.commit).toHaveBeenCalledOnce();
  });
});
