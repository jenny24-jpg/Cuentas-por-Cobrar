import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

const reciboRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), previewRecibo: vi.fn() }));
const pagoRepo = vi.hoisted(() => ({ findById: vi.fn() }));
vi.mock('../../../server/src/modules/cxc/repositories/pagos/recibo.repository', () => reciboRepo);
vi.mock('../../../server/src/modules/cxc/repositories/pagos/pago.repository', () => pagoRepo);

import * as recibos from '../../../server/src/modules/cxc/services/pagos/recibo.service';
import * as aplicaciones from '../../../server/src/modules/cxc/repositories/pagos/aplicacionAnticipo.repository';

const HOY = '2026-10-27';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// Recibos: número y monto los pone el sistema; un recibo emitido no se toca.
// ---------------------------------------------------------------------------
describe('recibo.service', () => {
  const pago = { idPago: 9, idCliente: 1, estado: 'APLICADO', monto: 100, fechaPago: '2026-10-20' };
  const recibo = { idRecibo: 3, idCliente: 1, idPago: 9, fecha: '2026-10-21', monto: 100, estado: 'CANCELADO' };
  beforeEach(() => {
    pagoRepo.findById.mockResolvedValue(pago);
    reciboRepo.findById.mockResolvedValue(recibo);
    reciboRepo.create.mockResolvedValue(3);
  });

  it('lista con paginación', async () => {
    reciboRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await recibos.listRecibos({ limit: '0' });
    expect(reciboRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 20, search: undefined });
  });
  it('get id inválido / inexistente', async () => {
    await expect(recibos.getRecibo(0)).rejects.toMatchObject({ statusCode: 400 });
    reciboRepo.findById.mockResolvedValue(null);
    await expect(recibos.getRecibo(3)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('createRecibo', () => {
    const datos = (extra: Record<string, unknown> = {}) => ({ idCliente: 1, idPago: 9, fecha: HOY, ...extra });
    it('fecha futura → 400', () => expect(recibos.createRecibo(datos({ fecha: '2026-10-28' }))).rejects.toThrow(/futura/));
    it('pago inexistente → 400', async () => {
      pagoRepo.findById.mockResolvedValue(null);
      await expect(recibos.createRecibo(datos())).rejects.toThrow(/no existe/);
    });
    it('pago de otro cliente → 400', async () => {
      pagoRepo.findById.mockResolvedValue({ ...pago, idCliente: 2 });
      await expect(recibos.createRecibo(datos())).rejects.toThrow(/mismo cliente/);
    });
    it('pago anulado → 400', async () => {
      pagoRepo.findById.mockResolvedValue({ ...pago, estado: 'anulado' });
      await expect(recibos.createRecibo(datos())).rejects.toThrow(/anulados o reversados/);
    });
    it('recibo anterior al pago → 400', () => expect(recibos.createRecibo(datos({ fecha: '2026-10-19' }))).rejects.toThrow(/anterior a la fecha del pago/));
    it('éxito: el contrato no deja enviar número ni monto', async () => {
      await recibos.createRecibo(datos({ numeroRecibo: 'X-1', monto: 5 }));
      expect(reciboRepo.create).toHaveBeenCalledWith({ idCliente: 1, idPago: 9, fecha: HOY, estado: 'EMITIDO' });
    });
  });

  describe('updateRecibo', () => {
    it('emitido → 409', async () => {
      reciboRepo.findById.mockResolvedValue({ ...recibo, estado: 'EMITIDO' });
      await expect(recibos.updateRecibo(3, {})).rejects.toMatchObject({ statusCode: 409 });
    });
    it('fecha futura → 400', () => expect(recibos.updateRecibo(3, { fecha: '2026-11-01' })).rejects.toThrow(/futura/));
    it('monto del recibo mayor que el pago → 400', async () => {
      reciboRepo.findById.mockResolvedValue({ ...recibo, monto: 150 });
      await expect(recibos.updateRecibo(3, {})).rejects.toThrow(/superar el monto del pago/);
    });
    it('monto del recibo en cero → 400', async () => {
      reciboRepo.findById.mockResolvedValue({ ...recibo, monto: 0 });
      await expect(recibos.updateRecibo(3, {})).rejects.toThrow(/mayor a cero/);
    });
    it('éxito: revalida contra el pago y delega al repositorio', async () => {
      await recibos.updateRecibo(3, { fecha: HOY });
      expect(pagoRepo.findById).toHaveBeenCalledWith(9);
      expect(reciboRepo.update).toHaveBeenCalledWith(3, expect.objectContaining({ fecha: HOY }));
    });
    // DEFECTO: el esquema de edición hereda estado 'EMITIDO' por defecto (ver esquemasActualizacion.test.ts).
    it.fails('DEFECTO: editar la fecha de un recibo CANCELADO no debe cambiar su estado', async () => {
      await recibos.updateRecibo(3, { fecha: HOY });
      expect(reciboRepo.update).toHaveBeenCalledWith(3, { fecha: HOY });
    });
  });

  it('deleteRecibo: emitido → 409; cancelado se elimina', async () => {
    reciboRepo.findById.mockResolvedValueOnce({ ...recibo, estado: 'EMITIDO' });
    await expect(recibos.deleteRecibo(3)).rejects.toMatchObject({ statusCode: 409 });
    await recibos.deleteRecibo(3);
    expect(reciboRepo.remove).toHaveBeenCalledWith(3);
  });

  describe('previewRecibo', () => {
    it.each(['x', 0, -1, 1.5])('idPago inválido %s → 400', (id) => expect(recibos.previewRecibo(id, HOY)).rejects.toMatchObject({ statusCode: 400 }));
    it('usa la fecha enviada si es válida; si no, hoy', async () => {
      reciboRepo.previewRecibo.mockResolvedValue({ numeroRecibo: 'REC-2026-000001', monto: 100 });
      await recibos.previewRecibo('9', '2026-10-01');
      await recibos.previewRecibo('9', 'ayer');
      expect(reciboRepo.previewRecibo.mock.calls).toEqual([[9, '2026-10-01'], [9, HOY]]);
    });
  });
});

// ---------------------------------------------------------------------------
// Aplicación de anticipo: transacción con bloqueo de anticipo y documento.
// ---------------------------------------------------------------------------
describe('aplicacionAnticipo.repository', () => {
  const anticipo = { ID_ANTICIPO: 4, ID_CLIENTE: 1, MONTO_ORIGINAL: 100, MONTO_DISPONIBLE: 100, ESTADO: 'DISPONIBLE', FECHA_ISO: '2026-10-20' };
  const documento = { ID_DOCUMENTO: 5, ID_CLIENTE: 1, TOTAL: 300, SALDO: 300, ESTADO: 'PENDIENTE' };
  const reglas = (o: { anticipo?: unknown[]; documento?: unknown[]; aplicacion?: unknown[] } = {}): Regla[] => [
    { sql: /FROM CXC_ANTICIPOS WHERE ID_ANTICIPO = :idAnticipo FOR UPDATE/, rows: o.anticipo ?? [anticipo] },
    { sql: /FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO = :idDocumento FOR UPDATE/, rows: o.documento ?? [documento] },
    { sql: /FROM CXC_APLICACION_ANTICIPO WHERE ID_APLICACION_ANTICIPO = :id FOR UPDATE/, rows: o.aplicacion ?? [] },
    { sql: /INSERT INTO CXC_APLICACION_ANTICIPO/, outId: 31 },
  ];
  const datos = (extra: Record<string, unknown> = {}) =>
    ({ idAnticipo: 4, idDocumento: 5, montoAplicado: 40, fechaAplicacion: HOY, idEmpleado: 2, ...extra }) as Parameters<typeof aplicaciones.create>[0];

  async function esperaError(r: Regla[], d: ReturnType<typeof datos>, mensaje: RegExp) {
    const { conn, ejecuto } = crearConexion(r);
    db.getConnection.mockResolvedValue(conn);
    await expect(aplicaciones.create(d)).rejects.toThrow(mensaje);
    expect(ejecuto(/INSERT INTO CXC_APLICACION_ANTICIPO/)).toHaveLength(0);
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.close).toHaveBeenCalledOnce();
  }

  describe('create', () => {
    it('anticipo inexistente', () => esperaError(reglas({ anticipo: [] }), datos(), /anticipo seleccionado no existe/));
    it('fecha distinta de hoy', () => esperaError(reglas(), datos({ fechaAplicacion: '2026-10-26' }), /fecha actual/));
    it('anticipo posterior a hoy', () => esperaError(reglas({ anticipo: [{ ...anticipo, FECHA_ISO: '2026-10-28' }] }), datos(), /anterior a la fecha del anticipo/));
    it('documento inexistente', () => esperaError(reglas({ documento: [] }), datos(), /documento seleccionado no existe/));
    it.each([['CANCELADO', /cancelado/], ['AGOTADO', /totalmente aplicado/]])('anticipo %s', (ESTADO, m) =>
      esperaError(reglas({ anticipo: [{ ...anticipo, ESTADO }] }), datos(), m));
    it.each([[{ ESTADO: 'PAGADO' }], [{ ESTADO: 'ANULADO' }], [{ SALDO: 0 }]])('documento sin saldo o cerrado %o', (cambio) =>
      esperaError(reglas({ documento: [{ ...documento, ...cambio }] }), datos(), /no tiene saldo pendiente/));
    it('cliente distinto', () => esperaError(reglas({ documento: [{ ...documento, ID_CLIENTE: 2 }] }), datos(), /mismo cliente/));
    it('monto mayor que el saldo del documento', () => esperaError(reglas({ documento: [{ ...documento, SALDO: 30 }] }), datos(), /saldo del documento/));
    it('monto mayor que el disponible del anticipo', () => esperaError(reglas({ anticipo: [{ ...anticipo, MONTO_DISPONIBLE: 20 }] }), datos(), /disponible del anticipo/));

    it('aplicación parcial: baja saldo y disponible, anticipo queda APLICADO', async () => {
      const { conn, ejecuto } = crearConexion(reglas());
      db.getConnection.mockResolvedValue(conn);
      await expect(aplicaciones.create(datos())).resolves.toBe(31);
      expect(ejecuto(/UPDATE CXC_DOCUMENTOS SET SALDO/)[0].binds).toMatchObject({ saldo: 260 });
      expect(ejecuto(/UPDATE CXC_ANTICIPOS/)[0].binds).toMatchObject({ disponible: 60, estado: 'APLICADO' });
      expect(ejecuto(/CXC_DOCUMENTO_HISTORIAL|INSERT INTO CXC_HIST/i).length + ejecuto(/APLICACION_ANTICIPO/).length).toBeGreaterThan(0);
      expect(conn.commit).toHaveBeenCalledOnce();
    });

    it('aplicación total: anticipo queda AGOTADO', async () => {
      const { conn, ejecuto } = crearConexion(reglas());
      db.getConnection.mockResolvedValue(conn);
      await aplicaciones.create(datos({ montoAplicado: 100 }));
      expect(ejecuto(/UPDATE CXC_ANTICIPOS/)[0].binds).toMatchObject({ disponible: 0, estado: 'AGOTADO' });
    });
  });

  it('update / remove siempre → 409', async () => {
    await expect(aplicaciones.update(1, {})).rejects.toMatchObject({ statusCode: 409 });
    await expect(aplicaciones.remove(1)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('sumAplicadoPorAnticipo excluye la aplicación indicada', async () => {
    const { conn, ejecuto } = crearConexion([{ sql: /SUM\(MONTO_APLICADO\)/, rows: [{ TOTAL: 25 }] }]);
    db.getConnection.mockResolvedValue(conn);
    await expect(aplicaciones.sumAplicadoPorAnticipo(4, 7)).resolves.toBe(25);
    expect(ejecuto(/SUM/)[0].binds).toEqual({ idAnticipo: 4, excludeId: 7 });
  });

  describe('reversar', () => {
    const aplicacion = { ID_APLICACION_ANTICIPO: 31, ID_ANTICIPO: 4, ID_DOCUMENTO: 5, MONTO_APLICADO: 40, ESTADO: 'CONFIRMADA', FECHA_APLICACION_ISO: '2026-10-25' };
    const rev = { idEmpleadoReversa: 2, motivoReversa: 'Se aplicó al documento equivocado' };
    async function esperaErrorRev(r: Regla[], d: typeof rev & { fechaReversa?: string }, mensaje: RegExp) {
      const { conn, ejecuto } = crearConexion(r);
      db.getConnection.mockResolvedValue(conn);
      await expect(aplicaciones.reversar(31, d)).rejects.toThrow(mensaje);
      expect(ejecuto(/SET ESTADO = 'REVERSADA'/)).toHaveLength(0);
      expect(conn.rollback).toHaveBeenCalledOnce();
    }
    it('inexistente', () => esperaErrorRev(reglas(), rev, /no encontrada/));
    it('ya reversada', () => esperaErrorRev(reglas({ aplicacion: [{ ...aplicacion, ESTADO: 'REVERSADA' }] }), rev, /ya fue reversada/));
    it('fecha futura', () => esperaErrorRev(reglas({ aplicacion: [aplicacion] }), { ...rev, fechaReversa: '2026-10-30' }, /futura/));
    it('fecha anterior a la aplicación', () => esperaErrorRev(reglas({ aplicacion: [aplicacion] }), { ...rev, fechaReversa: '2026-10-24' }, /anterior a la aplicación/));
    it('anticipo eliminado', () => esperaErrorRev(reglas({ aplicacion: [aplicacion], anticipo: [] }), rev, /anticipo de la aplicación ya no existe/));
    it('documento eliminado', () => esperaErrorRev(reglas({ aplicacion: [aplicacion], documento: [] }), rev, /documento de la aplicación ya no existe/));
    it('documento anulado', () => esperaErrorRev(reglas({ aplicacion: [aplicacion], documento: [{ ...documento, ESTADO: 'ANULADO' }] }), rev, /documento anulado/));

    it.each([
      [{ MONTO_DISPONIBLE: 60, ESTADO: 'APLICADO' }, 100, 'DISPONIBLE'],
      [{ MONTO_DISPONIBLE: 0, ESTADO: 'AGOTADO', MONTO_ORIGINAL: 200 }, 40, 'APLICADO'],
      [{ MONTO_DISPONIBLE: 60, ESTADO: 'CANCELADO' }, 100, 'CANCELADO'],
    ])('devuelve saldo y disponible: %o → %d %s', async (cambio, disponible, estado) => {
      const { conn, ejecuto } = crearConexion(reglas({ aplicacion: [aplicacion], anticipo: [{ ...anticipo, ...cambio }], documento: [{ ...documento, SALDO: 260 }] }));
      db.getConnection.mockResolvedValue(conn);
      await aplicaciones.reversar(31, rev);
      expect(ejecuto(/UPDATE CXC_DOCUMENTOS SET SALDO/)[0].binds).toMatchObject({ saldo: 300 });
      expect(ejecuto(/UPDATE CXC_ANTICIPOS/)[0].binds).toMatchObject({ disponible, estado });
      expect(ejecuto(/SET ESTADO = 'REVERSADA'/)[0].binds).toMatchObject({ idEmpleadoReversa: 2, fechaReversa: HOY });
      expect(conn.commit).toHaveBeenCalledOnce();
    });
  });

  it('findAll arma búsqueda y paginación', async () => {
    const { conn, ejecuto } = crearConexion([{ sql: /COUNT\(\*\) TOTAL/, rows: [{ TOTAL: 3 }] }]);
    db.getConnection.mockResolvedValue(conn);
    await expect(aplicaciones.findAll({ page: 2, limit: 10, search: 'Pérez' })).resolves.toEqual({ data: [], total: 3 });
    expect(ejecuto(/OFFSET/)[0].binds).toMatchObject({ search: '%Pérez%', offset: 10, limit: 10 });
  });
});
