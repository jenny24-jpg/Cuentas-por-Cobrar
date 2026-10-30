import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const docRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), anular: vi.fn(), previewNumero: vi.fn() }));
const catDocs = vi.hoisted(() => ({ findClienteNit: vi.fn() }));
const condRepo = vi.hoisted(() => ({ findById: vi.fn() }));
const clienteRepo = vi.hoisted(() => ({ findById: vi.fn() }));
const tipoRepo = vi.hoisted(() => ({ esTipoMora: vi.fn(), findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), findDuplicado: vi.fn(), countDocumentos: vi.fn() }));
const catalogos = vi.hoisted(() => ({ empleadoExiste: vi.fn() }));
const ajusteRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), aprobar: vi.fn(), rechazar: vi.fn() }));
const detalleRepo = vi.hoisted(() => ({ findByDocumento: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
const historialRepo = vi.hoisted(() => ({ findByDocumento: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('../../../server/src/modules/cxc/repositories/documentos/documento.repository', () => docRepo);
vi.mock('../../../server/src/modules/cxc/repositories/documentos/catalogosDocumentos.repository', () => catDocs);
vi.mock('../../../server/src/modules/cxc/repositories/credito/condicionCredito.repository', () => condRepo);
vi.mock('../../../server/src/modules/cxc/repositories/organizacion/cliente.repository', () => clienteRepo);
vi.mock('../../../server/src/modules/cxc/repositories/documentos/tipoDocumento.repository', () => tipoRepo);
vi.mock('../../../server/src/modules/cxc/repositories/catalogos.repository', () => catalogos);
vi.mock('../../../server/src/modules/cxc/repositories/documentos/ajuste.repository', () => ajusteRepo);
vi.mock('../../../server/src/modules/cxc/repositories/documentos/documentoDetalle.repository', () => detalleRepo);
vi.mock('../../../server/src/modules/cxc/repositories/documentos/documentoHistorial.repository', () => historialRepo);

import * as documentos from '../../../server/src/modules/cxc/services/documentos/documento.service';
import * as ajustes from '../../../server/src/modules/cxc/services/documentos/ajuste.service';
import * as tipos from '../../../server/src/modules/cxc/services/documentos/tipoDocumento.service';
import * as detalles from '../../../server/src/modules/cxc/services/documentos/documentoDetalle.service';
import * as historial from '../../../server/src/modules/cxc/services/documentos/documentoHistorial.service';

const HOY = '2026-10-27';
const doc = {
  idDocumento: 5, idCliente: 1, idTipoDocumento: 2, idMoneda: 1, idCondicionCredito: 3,
  fechaDocumento: `${HOY}T00:00:00`, fechaVencimiento: '2026-11-26', total: 300, saldo: 300, estado: 'PENDIENTE',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
  docRepo.findById.mockResolvedValue(doc);
  docRepo.create.mockResolvedValue(5);
  tipoRepo.esTipoMora.mockResolvedValue(false);
  condRepo.findById.mockResolvedValue({ idCondicion: 3, diasCredito: 30, estado: 'A' });
  clienteRepo.findById.mockResolvedValue({ idCliente: 1, idCondicion: 3 });
  catDocs.findClienteNit.mockResolvedValue('1234567');
  catalogos.empleadoExiste.mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
describe('documento.service', () => {
  const nuevo = (extra: Record<string, unknown> = {}) => ({ idCliente: 1, idTipoDocumento: 2, idMoneda: 1, fechaDocumento: HOY, total: 300, ...extra });

  it('list / get', async () => {
    docRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await documentos.listDocumentos({ page: 'x', limit: '1000' });
    expect(docRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 100, search: undefined });
    await expect(documentos.getDocumento(-1)).rejects.toMatchObject({ statusCode: 400 });
    docRepo.findById.mockResolvedValue(null);
    await expect(documentos.getDocumento(5)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('previewNumeroDocumento', () => {
    it('tipo inválido → 400', () => expect(documentos.previewNumeroDocumento('abc')).rejects.toMatchObject({ statusCode: 400 }));
    it('tipo inexistente → 404', async () => {
      docRepo.previewNumero.mockRejectedValue(new Error('Tipo no encontrado'));
      await expect(documentos.previewNumeroDocumento('2')).rejects.toMatchObject({ statusCode: 404 });
    });
    it('otro error se propaga', async () => {
      docRepo.previewNumero.mockRejectedValue(new Error('ORA-12541'));
      await expect(documentos.previewNumeroDocumento('2')).rejects.toThrow('ORA-12541');
    });
    it('éxito', async () => {
      docRepo.previewNumero.mockResolvedValue({ serie: 'FAC', numero: '00000010' });
      await expect(documentos.previewNumeroDocumento('2')).resolves.toEqual({ serie: 'FAC', numero: '00000010' });
    });
  });

  describe('createDocumento', () => {
    it('una nota de débito por mora no se crea a mano', async () => {
      tipoRepo.esTipoMora.mockResolvedValue(true);
      await expect(documentos.createDocumento(nuevo())).rejects.toThrow(/automáticamente/);
    });
    it('fecha distinta de hoy → 400', () => expect(documentos.createDocumento(nuevo({ fechaDocumento: '2026-10-26' }))).rejects.toThrow(/fecha actual/));
    it('sin condición en el documento usa la del cliente y calcula el vencimiento', async () => {
      await documentos.createDocumento(nuevo());
      expect(clienteRepo.findById).toHaveBeenCalledWith(1);
      expect(docRepo.create).toHaveBeenCalledWith(expect.objectContaining({ idCondicionCredito: 3, fechaVencimiento: '2026-11-26', nitCliente: '1234567' }));
    });
    it('el vencimiento lo calcula el servidor aunque se envíe otro', async () => {
      await documentos.createDocumento(nuevo({ fechaVencimiento: '2030-01-01' }));
      expect(docRepo.create).toHaveBeenCalledWith(expect.objectContaining({ fechaVencimiento: '2026-11-26' }));
    });
    it('cruza fin de año y meses cortos sin problemas de zona horaria', async () => {
      vi.setSystemTime(new Date('2026-12-15T18:00:00Z'));
      condRepo.findById.mockResolvedValue({ idCondicion: 3, diasCredito: 60, estado: 'A' });
      await documentos.createDocumento(nuevo({ fechaDocumento: '2026-12-15' }));
      expect(docRepo.create).toHaveBeenCalledWith(expect.objectContaining({ fechaVencimiento: '2027-02-13' }));
    });
    it('cliente sin condición y documento sin condición → 400', async () => {
      clienteRepo.findById.mockResolvedValue({ idCliente: 1, idCondicion: null });
      await expect(documentos.createDocumento(nuevo())).rejects.toThrow(/no tiene condición/);
    });
    it('condición inexistente o inactiva → 400', async () => {
      condRepo.findById.mockResolvedValueOnce(null);
      await expect(documentos.createDocumento(nuevo({ idCondicionCredito: 9 }))).rejects.toThrow(/no existe/);
      condRepo.findById.mockResolvedValueOnce({ idCondicion: 9, diasCredito: 30, estado: 'I' });
      await expect(documentos.createDocumento(nuevo({ idCondicionCredito: 9 }))).rejects.toThrow(/inactiva/);
    });
  });

  describe('updateDocumento', () => {
    it('una nota de mora no se edita', async () => {
      tipoRepo.esTipoMora.mockResolvedValue(true);
      await expect(documentos.updateDocumento(5, { total: 10 })).rejects.toMatchObject({ statusCode: 409 });
    });
    it.each([['PAGADO'], ['ANULADO']])('documento %s no se edita', async (estado) => {
      docRepo.findById.mockResolvedValue({ ...doc, estado });
      await expect(documentos.updateDocumento(5, {})).rejects.toThrow(/pagado o anulado/);
    });
    it('con movimientos (saldo ≠ total) no se edita', async () => {
      docRepo.findById.mockResolvedValue({ ...doc, saldo: 100 });
      await expect(documentos.updateDocumento(5, {})).rejects.toThrow(/movimientos financieros/);
    });
    it('no cambia el tipo ni la fecha', async () => {
      await expect(documentos.updateDocumento(5, { idTipoDocumento: 9 })).rejects.toThrow(/tipo de documento no puede cambiarse/);
      await expect(documentos.updateDocumento(5, { fechaDocumento: '2026-10-01' })).rejects.toThrow(/fecha original/);
    });
    it('cambiar el total reinicia saldo y estado; cambiar cliente actualiza el NIT', async () => {
      catDocs.findClienteNit.mockResolvedValue('999');
      await documentos.updateDocumento(5, { total: 450, idCliente: 7 });
      expect(docRepo.update).toHaveBeenCalledWith(5, expect.objectContaining({ saldo: 450, estado: 'PENDIENTE', nitCliente: '999', fechaVencimiento: '2026-11-26' }));
      expect(docRepo.update.mock.calls[0][1]).not.toHaveProperty('fechaDocumento');
    });
    it('mismo total no toca saldo ni estado', async () => {
      await documentos.updateDocumento(5, { total: 300 });
      expect(docRepo.update.mock.calls[0][1]).not.toHaveProperty('saldo');
    });
  });

  describe('deleteDocumento', () => {
    it.each([[{ saldo: 100 }], [{ estado: 'PAGADO' }], [{ estado: 'ANULADO' }]])('no se elimina %o', async (cambio) => {
      docRepo.findById.mockResolvedValue({ ...doc, ...cambio });
      await expect(documentos.deleteDocumento(5)).rejects.toMatchObject({ statusCode: 409 });
    });
    it.each(['PENDIENTE', 'vencido'])('%s sin movimientos se elimina', async (estado) => {
      docRepo.findById.mockResolvedValue({ ...doc, estado });
      await documentos.deleteDocumento(5);
      expect(docRepo.remove).toHaveBeenCalledWith(5);
    });
  });

  describe('anularDocumento', () => {
    const datos = { idEmpleadoAnulacion: 2, motivoAnulacion: 'Emitido al cliente equivocado' };
    it('id inválido → 400', () => expect(documentos.anularDocumento(0, datos)).rejects.toMatchObject({ statusCode: 400 }));
    it('fecha futura → 400', () => expect(documentos.anularDocumento(5, { ...datos, fechaAnulacion: '2026-10-30' })).rejects.toThrow(/futura/));
    it('empleado inexistente → 400', async () => {
      catalogos.empleadoExiste.mockResolvedValue(false);
      await expect(documentos.anularDocumento(5, datos)).rejects.toThrow(/empleado/);
    });
    it('éxito', async () => {
      await documentos.anularDocumento(5, datos);
      expect(docRepo.anular).toHaveBeenCalledWith(5, expect.objectContaining(datos));
    });
  });
});

// ---------------------------------------------------------------------------
describe('ajuste.service', () => {
  const ajuste = { idAjuste: 8, idCliente: 1, idDocumento: 5, tipoAjuste: 'CREDITO', monto: 50, estado: 'PENDIENTE', idEmpleadoAprobador: null };
  const nuevo = (extra: Record<string, unknown> = {}) => ({ idCliente: 1, idDocumento: 5, tipoAjuste: 'CREDITO', monto: 50, motivo: 'Corrección de precio unitario', idEmpleado: 2, ...extra });
  beforeEach(() => {
    ajusteRepo.findById.mockResolvedValue(ajuste);
    ajusteRepo.create.mockResolvedValue(8);
  });

  it('list / get', async () => {
    ajusteRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await ajustes.listAjustes({});
    expect(ajusteRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 20, search: undefined });
    ajusteRepo.findById.mockResolvedValue(null);
    await expect(ajustes.getAjuste(8)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('createAjuste', () => {
    it.each([
      ['documento inexistente', null, /no existe/],
      ['de otro cliente', { ...doc, idCliente: 2 }, /cliente seleccionado/],
      ['documento pagado', { ...doc, estado: 'PAGADO' }, /pagado o anulado/],
      ['crédito mayor que el saldo', { ...doc, saldo: 20 }, /superar el saldo/],
    ])('%s → 400', async (_n, d, mensaje) => {
      docRepo.findById.mockResolvedValue(d);
      await expect(ajustes.createAjuste(nuevo())).rejects.toThrow(mensaje);
    });
    it('un débito puede superar el saldo (aumenta la deuda)', async () => {
      docRepo.findById.mockResolvedValue({ ...doc, saldo: 20 });
      await ajustes.createAjuste(nuevo({ tipoAjuste: 'DEBITO' }));
      expect(ajusteRepo.create).toHaveBeenCalled();
    });
    it('sin documento no valida relación', async () => {
      await ajustes.createAjuste(nuevo({ idDocumento: null }));
      expect(docRepo.findById).not.toHaveBeenCalled();
    });
    it('motivo corto → error de validación', () => expect(ajustes.createAjuste(nuevo({ motivo: 'corto' }))).rejects.toThrow(/mínimo 10/));
  });

  it('editar / eliminar solo pendientes', async () => {
    ajusteRepo.findById.mockResolvedValue({ ...ajuste, estado: 'APROBADO' });
    await expect(ajustes.updateAjuste(8, {})).rejects.toThrow(/aprobado/);
    await expect(ajustes.deleteAjuste(8)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('editar revalida con los valores finales', async () => {
    await ajustes.updateAjuste(8, { monto: 60 });
    expect(docRepo.findById).toHaveBeenCalledWith(5);
    expect(ajusteRepo.update).toHaveBeenCalledWith(8, { monto: 60 });
  });
  it('eliminar pendiente', async () => {
    await ajustes.deleteAjuste(8);
    expect(ajusteRepo.remove).toHaveBeenCalledWith(8);
  });

  describe('aprobar / rechazar', () => {
    it('id inválido → 400', async () => {
      await expect(ajustes.aprobarAjuste(0, { idEmpleadoAprobador: 3 })).rejects.toMatchObject({ statusCode: 400 });
      await expect(ajustes.rechazarAjuste(0, { idEmpleadoAprobador: 3, motivoRechazo: 'No procede' })).rejects.toMatchObject({ statusCode: 400 });
    });
    it('fecha futura → 400', async () => {
      await expect(ajustes.aprobarAjuste(8, { idEmpleadoAprobador: 3, fechaAprobacion: '2026-11-01' })).rejects.toThrow(/futura/);
      await expect(ajustes.rechazarAjuste(8, { idEmpleadoAprobador: 3, motivoRechazo: 'No procede', fechaAprobacion: '2026-11-01' })).rejects.toThrow(/futura/);
    });
    it('empleado inexistente → 400', async () => {
      catalogos.empleadoExiste.mockResolvedValue(false);
      await expect(ajustes.aprobarAjuste(8, { idEmpleadoAprobador: 3 })).rejects.toThrow(/no existe/);
      await expect(ajustes.rechazarAjuste(8, { idEmpleadoAprobador: 3, motivoRechazo: 'No procede' })).rejects.toThrow(/no existe/);
    });
    it('ajuste ya aprobado o rechazado → 409', async () => {
      ajusteRepo.findById.mockResolvedValue({ ...ajuste, estado: 'RECHAZADO' });
      await expect(ajustes.aprobarAjuste(8, { idEmpleadoAprobador: 3 })).rejects.toMatchObject({ statusCode: 409 });
      await expect(ajustes.rechazarAjuste(8, { idEmpleadoAprobador: 3, motivoRechazo: 'No procede' })).rejects.toMatchObject({ statusCode: 409 });
    });
    it('el segundo aprobador debe ser distinto al primero', async () => {
      ajusteRepo.findById.mockResolvedValue({ ...ajuste, estado: 'EN_2DA_APROBACION', idEmpleadoAprobador: 3 });
      await expect(ajustes.aprobarAjuste(8, { idEmpleadoAprobador: 3 })).rejects.toThrow(/distinto/);
      await ajustes.aprobarAjuste(8, { idEmpleadoAprobador: 4 });
      expect(ajusteRepo.aprobar).toHaveBeenCalledWith(8, { idEmpleadoAprobador: 4 });
    });
    it('rechazar éxito', async () => {
      await ajustes.rechazarAjuste(8, { idEmpleadoAprobador: 3, motivoRechazo: 'No procede' });
      expect(ajusteRepo.rechazar).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
describe('tipoDocumento.service', () => {
  const tipo = { idTipoDocumento: 2, codigo: 'FAC ', nombre: 'Factura', naturaleza: 'CARGO', estado: 'A' };
  beforeEach(() => {
    tipoRepo.findById.mockResolvedValue(tipo);
    tipoRepo.findDuplicado.mockResolvedValue(null);
    tipoRepo.countDocumentos.mockResolvedValue(0);
    tipoRepo.create.mockResolvedValue(2);
  });
  it('list / get', async () => {
    tipoRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await tipos.listTiposDocumento({ limit: '25' });
    expect(tipoRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 25, search: undefined });
    tipoRepo.findById.mockResolvedValue(null);
    await expect(tipos.getTipoDocumento(2)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('crear: código en mayúsculas; código o nombre inválidos se rechazan', async () => {
    await tipos.createTipoDocumento({ codigo: 'nd', nombre: 'Nota de Débito', naturaleza: 'CARGO' });
    expect(tipoRepo.create).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'ND' }));
    await expect(tipos.createTipoDocumento({ codigo: 'N1', nombre: 'Nota', naturaleza: 'CARGO' })).rejects.toThrow();
    await expect(tipos.createTipoDocumento({ codigo: 'NDX', nombre: 'Nota 2', naturaleza: 'CARGO' })).rejects.toThrow(/letras/);
  });
  it('crear duplicado por código o por nombre → 409 con mensaje distinto', async () => {
    tipoRepo.findDuplicado.mockResolvedValue({ CODIGO: 'ND ', NOMBRE: 'Nota de Débito' });
    await expect(tipos.createTipoDocumento({ codigo: 'ND', nombre: 'Otra Nota', naturaleza: 'CARGO' })).rejects.toThrow(/código ND ya está/);
    await expect(tipos.createTipoDocumento({ codigo: 'NX', nombre: 'Nota de Débito', naturaleza: 'CARGO' })).rejects.toThrow(/Ya existe un tipo/);
  });
  it('no cambia el código si ya hay documentos con esa serie', async () => {
    tipoRepo.countDocumentos.mockResolvedValue(3);
    await expect(tipos.updateTipoDocumento(2, { codigo: 'FC' })).rejects.toThrow(/código no puede cambiarse/);
  });
  it('mismo código y nombre no buscan duplicados', async () => {
    await tipos.updateTipoDocumento(2, { codigo: 'FAC', nombre: 'Factura' });
    expect(tipoRepo.countDocumentos).not.toHaveBeenCalled();
    expect(tipoRepo.findDuplicado).toHaveBeenCalledWith(undefined, undefined, 2);
  });
  it('eliminar: con documentos → 409; sin documentos se elimina', async () => {
    tipoRepo.countDocumentos.mockResolvedValueOnce(4);
    await expect(tipos.deleteTipoDocumento(2)).rejects.toThrow(/4 documento/);
    await tipos.deleteTipoDocumento(2);
    expect(tipoRepo.remove).toHaveBeenCalledWith(2);
  });
});

// ---------------------------------------------------------------------------
describe('documentoDetalle.service', () => {
  const detalle = { idDetalle: 1, idDocumento: 5, cantidad: 2, precioUnitario: 10, total: 20 };
  beforeEach(() => {
    detalleRepo.findById.mockResolvedValue(detalle);
    detalleRepo.create.mockResolvedValue(1);
  });
  it('listar exige documento existente', async () => {
    detalleRepo.findByDocumento.mockResolvedValue([detalle]);
    await expect(detalles.listDetalles(5)).resolves.toEqual([detalle]);
  });
  it('get inexistente → 404', async () => {
    detalleRepo.findById.mockResolvedValue(null);
    await expect(detalles.getDetalle(1)).rejects.toMatchObject({ statusCode: 404 });
  });
  it.each([[{ estado: 'PAGADO' }], [{ saldo: 100 }]])('documento cerrado o con movimientos %o: líneas congeladas', async (cambio) => {
    docRepo.findById.mockResolvedValue({ ...doc, ...cambio });
    await expect(detalles.createDetalle(5, { descripcion: 'X', cantidad: 1, precioUnitario: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(detalles.updateDetalle(1, { cantidad: 3 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(detalles.deleteDetalle(1)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('crear toma el documento de la ruta, no del cuerpo', async () => {
    await detalles.createDetalle(5, { idDocumento: 99, descripcion: 'Servicio', cantidad: 1, precioUnitario: 10 });
    expect(detalleRepo.create).toHaveBeenCalledWith(expect.objectContaining({ idDocumento: 5 }));
  });
  it('editar cantidad o precio recalcula el total', async () => {
    await detalles.updateDetalle(1, { cantidad: 3 });
    expect(detalleRepo.update).toHaveBeenCalledWith(1, { cantidad: 3, total: 30 });
    await detalles.updateDetalle(1, { descripcion: 'Otra' });
    expect(detalleRepo.update).toHaveBeenLastCalledWith(1, { descripcion: 'Otra' });
  });
  it('eliminar', async () => {
    await detalles.deleteDetalle(1);
    expect(detalleRepo.remove).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
describe('documentoHistorial.service', () => {
  beforeEach(() => {
    historialRepo.findById.mockResolvedValue({ idHistorial: 1, idDocumento: 5, tipoEvento: null });
    historialRepo.create.mockResolvedValue(1);
  });
  it('listar / get', async () => {
    historialRepo.findByDocumento.mockResolvedValue([]);
    await expect(historial.listHistorial(5)).resolves.toEqual([]);
    historialRepo.findById.mockResolvedValue(null);
    await expect(historial.getHistorial(1)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('crear manual con el documento de la ruta', async () => {
    await historial.createHistorial(5, { estadoNuevo: 'PENDIENTE', idEmpleado: 2 });
    expect(historialRepo.create).toHaveBeenCalledWith(expect.objectContaining({ idDocumento: 5 }));
  });
  it('un evento automático no se edita ni elimina', async () => {
    historialRepo.findById.mockResolvedValue({ idHistorial: 1, idDocumento: 5, tipoEvento: 'APLICACION_PAGO' });
    await expect(historial.updateHistorial(1, {})).rejects.toMatchObject({ statusCode: 409 });
    await expect(historial.deleteHistorial(1)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('un registro manual sí se edita y elimina', async () => {
    await historial.updateHistorial(1, { estadoNuevo: 'VENCIDO' });
    await historial.deleteHistorial(1);
    expect(historialRepo.update).toHaveBeenCalled();
    expect(historialRepo.remove).toHaveBeenCalledWith(1);
  });
});
