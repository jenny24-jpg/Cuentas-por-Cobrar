import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ncRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), anular: vi.fn(), previewNumero: vi.fn() }));
const apNcRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), aprobar: vi.fn(), reversar: vi.fn() }));
const docRepo = vi.hoisted(() => ({ findById: vi.fn() }));
const condRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), existeIgual: vi.fn(), contarUso: vi.fn() }));
const moraRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), recalcularPendientes: vi.fn(), findCartera: vi.fn(), resumenCliente: vi.fn() }));
const catalogos = vi.hoisted(() => ({ empleadoExiste: vi.fn() }));
vi.mock('../../../server/src/modules/cxc/repositories/credito/notaCredito.repository', () => ncRepo);
vi.mock('../../../server/src/modules/cxc/repositories/credito/aplicacionNotaCredito.repository', () => apNcRepo);
vi.mock('../../../server/src/modules/cxc/repositories/documentos/documento.repository', () => docRepo);
vi.mock('../../../server/src/modules/cxc/repositories/credito/condicionCredito.repository', () => condRepo);
vi.mock('../../../server/src/modules/cxc/repositories/credito/mora.repository', () => moraRepo);
vi.mock('../../../server/src/modules/cxc/repositories/catalogos.repository', () => catalogos);

import * as nc from '../../../server/src/modules/cxc/services/credito/notaCredito.service';
import * as apNc from '../../../server/src/modules/cxc/services/credito/aplicacionNotaCredito.service';
import * as cond from '../../../server/src/modules/cxc/services/credito/condicionCredito.service';
import * as mora from '../../../server/src/modules/cxc/services/credito/mora.service';

const HOY = '2026-10-27';
const nota = { idNotaCredito: 6, idCliente: 1, idDocumentoReferencia: 5, monto: 50, fecha: `${HOY}T00:00:00`, estado: 'PENDIENTE', idEmpleadoRegistro: 10, idEmpleadoAprobacion: null };
const factura = { idDocumento: 5, idCliente: 1, saldo: 200, estado: 'PENDIENTE' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
  ncRepo.findById.mockResolvedValue(nota);
  ncRepo.create.mockResolvedValue(6);
  docRepo.findById.mockResolvedValue(factura);
  catalogos.empleadoExiste.mockResolvedValue(true);
  apNcRepo.findById.mockResolvedValue({ idAplicacion: 2 });
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
describe('notaCredito.service', () => {
  const nueva = (extra: Record<string, unknown> = {}) =>
    ({ idCliente: 1, idDocumentoReferencia: 5, descripcion: 'Descuento por pronto pago', fecha: HOY, monto: 50, ...extra });

  it('list acota la paginación', async () => {
    await nc.list({ page: 0, limit: 500 });
    expect(ncRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 100 });
  });
  it('getOne id inválido / inexistente', async () => {
    await expect(nc.getOne(0)).rejects.toMatchObject({ statusCode: 400 });
    ncRepo.findById.mockResolvedValue(null);
    await expect(nc.getOne(6)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('create', () => {
    it('fecha distinta de hoy → 400', () => expect(nc.create(nueva({ fecha: '2026-10-26' }), 10)).rejects.toThrow(/fecha actual/));
    it('sin documento de referencia o descripción corta → error de validación', async () => {
      await expect(nc.create(nueva({ idDocumentoReferencia: undefined }), 10)).rejects.toThrow(/documento al que aplica/);
      await expect(nc.create(nueva({ descripcion: 'corta' }), 10)).rejects.toThrow(/mínimo 10/);
    });
    it.each([
      ['documento inexistente', null, /no existe/],
      ['de otro cliente', { ...factura, idCliente: 2 }, /cliente seleccionado/],
      ['sin saldo', { ...factura, saldo: 0 }, /ya no tiene saldo/],
      ['monto mayor que el saldo', { ...factura, saldo: 30 }, /superar el saldo/],
      ['documento anulado', { ...factura, estado: 'ANULADO' }, /pagado o anulado/],
    ])('%s → rechazo', async (_n, doc, mensaje) => {
      docRepo.findById.mockResolvedValue(doc);
      await expect(nc.create(nueva(), 10)).rejects.toThrow(mensaje);
      expect(ncRepo.create).not.toHaveBeenCalled();
    });
    it('éxito: registra quién la creó y nace PENDIENTE', async () => {
      await nc.create(nueva(), 10);
      expect(ncRepo.create).toHaveBeenCalledWith(expect.objectContaining({ estado: 'PENDIENTE', fecha: HOY }), 10);
    });
    it('no se puede crear ya aplicada', () => expect(nc.create(nueva({ estado: 'APLICADA' }), 10)).rejects.toThrow());
  });

  describe('update', () => {
    it('no cambia la fecha', () => expect(nc.update(6, { fecha: '2026-10-01' })).rejects.toThrow(/no puede modificarse/));
    it('sin cambios de monto/cliente/documento no revalida el documento', async () => {
      await nc.update(6, { descripcion: 'Nueva descripción válida' });
      expect(docRepo.findById).not.toHaveBeenCalled();
      expect(ncRepo.update).toHaveBeenCalledWith(6, { descripcion: 'Nueva descripción válida' });
    });
    it('cambiar el monto revalida contra el saldo del documento', async () => {
      docRepo.findById.mockResolvedValue({ ...factura, saldo: 40 });
      await expect(nc.update(6, { monto: 45 })).rejects.toThrow(/superar el saldo/);
    });
  });

  it('remove siempre → 409 (no se borran)', () => expect(nc.remove(6)).rejects.toMatchObject({ statusCode: 409 }));

  describe('anular', () => {
    const datos = { idEmpleadoAnulacion: 10, motivoAnulacion: 'Se registró por error' };
    it('id inválido → 400', () => expect(nc.anular(0, datos)).rejects.toMatchObject({ statusCode: 400 }));
    it('otro empleado que no es ADMIN → 403', () =>
      expect(nc.anular(6, { ...datos, idEmpleadoAnulacion: 11 }, 'OPERADOR')).rejects.toMatchObject({ statusCode: 403 }));
    it('ADMIN puede anular la nota de otro', async () => {
      await nc.anular(6, { ...datos, idEmpleadoAnulacion: 11 }, 'ADMIN');
      expect(ncRepo.anular).toHaveBeenCalled();
    });
    it('fecha futura → 400', () => expect(nc.anular(6, { ...datos, fechaAnulacion: '2026-10-29' }, 'OPERADOR')).rejects.toThrow(/futura/));
    it('empleado inexistente → 400', async () => {
      catalogos.empleadoExiste.mockResolvedValue(false);
      await expect(nc.anular(6, datos, 'OPERADOR')).rejects.toThrow(/empleado/);
    });
  });

  it('previewNumero delega al repositorio', async () => {
    ncRepo.previewNumero.mockResolvedValue({ serie: 'NC', numero: '000007' });
    await expect(nc.previewNumero()).resolves.toEqual({ serie: 'NC', numero: '000007' });
  });

  describe('aprobar / rechazar', () => {
    it('quien la registró no la aprueba', () => expect(nc.aprobar(6, 10)).rejects.toThrow(/no puede aprobarla/));
    it.each([
      [{ idEmpleadoAprobacion: 12 }],
      [{ estado: 'APLICADA' }],
      [{ estado: 'ANULADA' }],
    ])('ya no está por aprobar %o → 409', async (cambio) => {
      ncRepo.findById.mockResolvedValue({ ...nota, ...cambio });
      await expect(nc.aprobar(6, 11)).rejects.toMatchObject({ statusCode: 409 });
      await expect(nc.rechazar(6, { motivoRechazo: 'No procede el descuento' }, 11)).rejects.toMatchObject({ statusCode: 409 });
    });
    it('aprobar éxito', async () => {
      await nc.aprobar(6, 11);
      expect(apNcRepo.aprobar).toHaveBeenCalledWith(6, 11);
    });
    it('rechazar: motivo obligatorio y queda anulada con prefijo', async () => {
      await expect(nc.rechazar(6, { motivoRechazo: 'no' }, 11)).rejects.toThrow(/mínimo 10/);
      await nc.rechazar(6, { motivoRechazo: 'No procede el descuento' }, 11);
      expect(ncRepo.anular).toHaveBeenCalledWith(6, { idEmpleadoAnulacion: 11, motivoAnulacion: 'Rechazada: No procede el descuento' });
    });
  });
});

// ---------------------------------------------------------------------------
describe('aplicacionNotaCredito.service', () => {
  it('list / getOne', async () => {
    await apNc.list({ page: -1, limit: 0 });
    expect(apNcRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 1 });
    await expect(apNc.getOne(0)).rejects.toMatchObject({ statusCode: 400 });
    apNcRepo.findById.mockResolvedValue(null);
    await expect(apNc.getOne(2)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('no hay aplicación manual, edición ni borrado', async () => {
    await expect(apNc.create({})).rejects.toMatchObject({ statusCode: 409 });
    await expect(apNc.update(1, {})).rejects.toMatchObject({ statusCode: 409 });
    await expect(apNc.remove(1)).rejects.toMatchObject({ statusCode: 409 });
  });
  describe('reversar', () => {
    const rev = { idEmpleadoReversa: 3, motivoReversa: 'El cliente devolvió el beneficio' };
    it('id inválido → 400', () => expect(apNc.reversar(0, rev)).rejects.toMatchObject({ statusCode: 400 }));
    it('fecha futura → 400', () => expect(apNc.reversar(2, { ...rev, fechaReversa: '2026-11-02' })).rejects.toThrow(/futura/));
    it('empleado inexistente → 400', async () => {
      catalogos.empleadoExiste.mockResolvedValue(false);
      await expect(apNc.reversar(2, rev)).rejects.toThrow(/empleado/);
    });
    it('éxito', async () => {
      await apNc.reversar(2, rev);
      expect(apNcRepo.reversar).toHaveBeenCalledWith(2, expect.objectContaining(rev));
    });
  });
});

// ---------------------------------------------------------------------------
describe('condicionCredito.service', () => {
  const actual = { idCondicion: 3, diasCredito: 30, diasGracia: 5, porcentajeMora: 2, estado: 'A' };
  beforeEach(() => {
    condRepo.findById.mockResolvedValue(actual);
    condRepo.existeIgual.mockResolvedValue(false);
    condRepo.contarUso.mockResolvedValue({ clientes: 0, documentos: 0 });
    condRepo.create.mockResolvedValue(3);
  });

  it('list con paginación', async () => {
    condRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await cond.listCondiciones({ page: '2' });
    expect(condRepo.findAll).toHaveBeenCalledWith({ page: 2, limit: 20, search: undefined });
  });
  it('get inexistente → 404', async () => {
    condRepo.findById.mockResolvedValue(null);
    await expect(cond.getCondicion(3)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('crear: contado (0 días) es válido; días negativos o mora 0 no', async () => {
    await cond.createCondicion({ diasCredito: 0, diasGracia: 0, porcentajeMora: 1 });
    expect(condRepo.create).toHaveBeenCalledWith({ diasCredito: 0, diasGracia: 0, porcentajeMora: 1, estado: 'A' });
    await expect(cond.createCondicion({ diasCredito: -1, diasGracia: 0, porcentajeMora: 1 })).rejects.toThrow(/negativos/);
    await expect(cond.createCondicion({ diasCredito: 30, diasGracia: 0, porcentajeMora: 0 })).rejects.toThrow(/mayor a 0/);
  });
  it('crear duplicada → 409', async () => {
    condRepo.existeIgual.mockResolvedValue(true);
    await expect(cond.createCondicion({ diasCredito: 30, diasGracia: 5, porcentajeMora: 2 })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('cambiar solo el estado no revisa uso ni duplicados', async () => {
    await cond.updateCondicion(3, { estado: 'I' });
    expect(condRepo.contarUso).not.toHaveBeenCalled();
    expect(condRepo.update).toHaveBeenCalledWith(3, expect.objectContaining({ estado: 'I' }));
  });
  it('enviar los mismos términos no cuenta como cambio', async () => {
    await cond.updateCondicion(3, { diasCredito: 30, porcentajeMora: 2 });
    expect(condRepo.contarUso).not.toHaveBeenCalled();
  });
  it('condición en uso: sus términos no cambian', async () => {
    condRepo.contarUso.mockResolvedValue({ clientes: 4, documentos: 9 });
    await expect(cond.updateCondicion(3, { diasCredito: 45 })).rejects.toThrow(/en uso/);
    expect(condRepo.update).not.toHaveBeenCalled();
  });
  it.fails('DEFECTO: el mensaje de "en uso" debe decir cuántos clientes y documentos la usan', async () => {
    condRepo.contarUso.mockResolvedValue({ clientes: 4, documentos: 9 });
    await expect(cond.updateCondicion(3, { diasCredito: 45 })).rejects.toThrow(/4 cliente\(s\), 9 documento\(s\)/);
  });
  it('nuevos términos iguales a otra condición → 409; se excluye a sí misma', async () => {
    condRepo.existeIgual.mockResolvedValue(true);
    await expect(cond.updateCondicion(3, { diasGracia: 10 })).rejects.toMatchObject({ statusCode: 409 });
    expect(condRepo.existeIgual).toHaveBeenCalledWith({ diasCredito: 30, diasGracia: 10, porcentajeMora: 2 }, 3);
  });
  it('eliminar delega', async () => {
    await cond.deleteCondicion(3);
    expect(condRepo.remove).toHaveBeenCalledWith(3);
  });
});

// ---------------------------------------------------------------------------
describe('mora.service', () => {
  it('list / getOne', async () => {
    await mora.list({ page: 0, limit: 1000 });
    expect(moraRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 100 });
    await expect(mora.getOne(0)).rejects.toMatchObject({ statusCode: 400 });
    moraRepo.findById.mockResolvedValue(null);
    await expect(mora.getOne(1)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('cartera y resumen usan la fecha de negocio de Guatemala', async () => {
    await mora.cartera();
    await mora.resumenCliente(4);
    expect(moraRepo.findCartera).toHaveBeenCalledWith(HOY);
    expect(moraRepo.resumenCliente).toHaveBeenCalledWith(4, HOY);
  });
  it('resumenCliente id inválido → 400', () => expect(mora.resumenCliente(0)).rejects.toMatchObject({ statusCode: 400 }));
  it('recalcular delega', async () => {
    moraRepo.recalcularPendientes.mockResolvedValue({ activas: 1 });
    await expect(mora.recalcular()).resolves.toEqual({ activas: 1 });
  });
});
