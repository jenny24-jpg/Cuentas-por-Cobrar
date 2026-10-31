import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import { registrarPago } from '../../../server/src/modules/cxc/repositories/cobranza/convenioCuota.repository';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

/**
 * Pagar una cuota de convenio es un pago real: crea el pago, lo reparte entre los
 * documentos del convenio (el que vence primero recibe primero), baja sus saldos,
 * deja historial y recibo, y cierra el convenio cuando ya no quedan cuotas.
 */
describe('convenioCuota.registrarPago', () => {
  const cuota = { ID_CONVENIO: 3, SALDO: 300, ESTADO: 'PENDIENTE', NUMERO_CUOTA: 1 };
  const docs = [
    { ID_DOCUMENTO: 10, ID_MONEDA: 1, TOTAL: 200, SALDO: 200, ESTADO: 'VENCIDO' },
    { ID_DOCUMENTO: 11, ID_MONEDA: 1, TOTAL: 500, SALDO: 500, ESTADO: 'PENDIENTE' },
  ];
  const reglas = (o: { cuota?: unknown[]; convenio?: unknown[]; docs?: unknown[]; pendientes?: number } = {}): Regla[] => [
    { sql: /SELECT ID_CONVENIO, SALDO, ESTADO, NUMERO_CUOTA FROM CXC_CONVENIO_CUOTAS/, rows: o.cuota ?? [cuota] },
    { sql: /SELECT ID_CLIENTE, ESTADO FROM CXC_CONVENIOS_PAGO/, rows: o.convenio ?? [{ ID_CLIENTE: 1, ESTADO: 'ACTIVO' }] },
    { sql: /FROM CXC_CONVENIO_DOCUMENTOS cvd JOIN CXC_DOCUMENTOS d/, rows: o.docs ?? docs },
    { sql: /INSERT INTO CXC_PAGOS/, outId: 400 },
    { sql: /INSERT INTO CXC_RECIBOS/, outId: 500 },
    { sql: /COUNT\(\*\) TOTAL FROM CXC_CONVENIO_CUOTAS/, rows: [{ TOTAL: o.pendientes ?? 2 }] },
    { sql: /FROM CXC_CONVENIO_CUOTAS cc/, rows: [{ ID_CUOTA: 1, ID_CONVENIO: 3, NUMERO_CUOTA: 1, MONTO: 300, SALDO: 0, ESTADO: 'PAGADA' }] },
  ];

  async function esperaError(r: Regla[], monto: number, mensaje: RegExp) {
    const { conn, ejecuto } = crearConexion(r);
    db.getConnection.mockResolvedValue(conn);
    await expect(registrarPago(1, monto, 1, undefined, 2)).rejects.toThrow(mensaje);
    expect(ejecuto(/INSERT INTO CXC_PAGOS/)).toHaveLength(0);
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.close).toHaveBeenCalledOnce();
  }

  it('cuota inexistente', () => esperaError(reglas({ cuota: [] }), 100, /no encontrada/));
  it.each([[{ ...cuota, SALDO: 0 }], [{ ...cuota, ESTADO: 'PAGADA' }]])('cuota ya pagada %o', (c) => esperaError(reglas({ cuota: [c] }), 100, /ya está pagada/));
  it('monto mayor que la cuota', () => esperaError(reglas(), 300.01, /superar el saldo de la cuota/));
  it('convenio eliminado', () => esperaError(reglas({ convenio: [] }), 100, /ya no existe/));
  it('convenio cancelado', () => esperaError(reglas({ convenio: [{ ID_CLIENTE: 1, ESTADO: 'CANCELADO' }] }), 100, /cancelado/));
  it('documentos ya pagados por otro medio', () => esperaError(reglas({ docs: [] }), 100, /no hay nada que aplicar/));

  it('reparte el pago: primero el documento que vence antes, con historial y recibo por cada uno', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await registrarPago(1, 300, 1, undefined, 2);

    expect(ejecuto(/INSERT INTO CXC_PAGOS/)[0].binds).toMatchObject({ idCliente: 1, monto: 300, numeroReferencia: 'PAG-2026-000001' });
    expect(ejecuto(/INSERT INTO CXC_APLICACION_PAGOS/).map((e) => [e.binds.idDocumento, e.binds.monto])).toEqual([[10, 200], [11, 100]]);
    expect(ejecuto(/UPDATE CXC_DOCUMENTOS SET SALDO/).map((e) => e.binds.saldo)).toEqual([0, 400]);
    expect(ejecuto(/INSERT INTO CXC_RECIBOS/)).toHaveLength(2);
    expect(ejecuto(/UPDATE CXC_PAGOS SET ESTADO/)[0].binds.estado).toBe('APLICADO');
    expect(ejecuto(/UPDATE CXC_CONVENIO_CUOTAS/)[0].binds).toMatchObject({ saldo: 0, estado: 'PAGADA' });
    expect(ejecuto(/SET ESTADO = 'CUMPLIDO'/)).toHaveLength(0);
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it('abono parcial: la cuota sigue pendiente', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await registrarPago(1, 120, 1, undefined, 2);
    expect(ejecuto(/INSERT INTO CXC_APLICACION_PAGOS/)).toHaveLength(1);
    expect(ejecuto(/UPDATE CXC_CONVENIO_CUOTAS/)[0].binds).toMatchObject({ saldo: 180, estado: 'PENDIENTE' });
    expect(ejecuto(/COUNT\(\*\) TOTAL FROM CXC_CONVENIO_CUOTAS/)).toHaveLength(0);
  });

  it('última cuota pagada: el convenio pasa a CUMPLIDO', async () => {
    const { conn, ejecuto } = crearConexion(reglas({ pendientes: 0 }));
    db.getConnection.mockResolvedValue(conn);
    await registrarPago(1, 300, 1, undefined, 2);
    expect(ejecuto(/SET ESTADO = 'CUMPLIDO'/)).toHaveLength(1);
  });

  it('OBSERVACIÓN: si los documentos ya no alcanzan, el pago queda EN_CUENTA pero la cuota se da por pagada completa', async () => {
    const { conn, ejecuto } = crearConexion(reglas({ docs: [{ ...docs[0], SALDO: 50 }] }));
    db.getConnection.mockResolvedValue(conn);
    await registrarPago(1, 300, 1, undefined, 2);
    expect(ejecuto(/UPDATE CXC_PAGOS SET ESTADO/)[0].binds.estado).toBe('EN_CUENTA');
    expect(ejecuto(/UPDATE CXC_CONVENIO_CUOTAS/)[0].binds).toMatchObject({ saldo: 0, estado: 'PAGADA' });
  });

  it('OBSERVACIÓN: con referencia bancaria el pago no recibe el correlativo PAG-AAAA-######', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await registrarPago(1, 100, 2, 'TRX-998877', 2);
    expect(ejecuto(/INSERT INTO CXC_PAGOS/)[0].binds.numeroReferencia).toBe('TRX-998877');
  });
});
