import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clienteRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), findResumen: vi.fn(), create: vi.fn(), update: vi.fn() }));
const empresaRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), findTiposComercio: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), findAllOptions: vi.fn() }));
const sucursalRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
const rutaRepo = vi.hoisted(() => ({
  findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), finalizar: vi.fn(),
  resumenPorEmpleado: vi.fn(), sucursalMasCercana: vi.fn(), validarSucursalYEmpleado: vi.fn(),
}));
const rutaDetalleRepo = vi.hoisted(() => ({ findByRuta: vi.fn(), findById: vi.fn(), remove: vi.fn() }));
const operacionRepo = vi.hoisted(() => ({ resumen: vi.fn(), pendientes: vi.fn(), pagosDisponibles: vi.fn(), asignar: vi.fn(), registrar: vi.fn(), perfil: vi.fn(), documentoAsignado: vi.fn() }));
const aplicacionService = vi.hoisted(() => ({ createAplicacionPago: vi.fn(), getAplicacionPago: vi.fn() }));
const pagoRepo = vi.hoisted(() => ({ cobrarEnRuta: vi.fn() }));
const catalogos = vi.hoisted(() => ({ listFormasPagoActivas: vi.fn() }));
const zonaRepo = vi.hoisted(() => ({ findActiva: vi.fn(), listActivas: vi.fn() }));
vi.mock('../../../server/src/modules/cxc/repositories/organizacion/cliente.repository', () => clienteRepo);
vi.mock('../../../server/src/modules/cxc/repositories/organizacion/empresa.repository', () => empresaRepo);
vi.mock('../../../server/src/modules/cxc/repositories/organizacion/sucursal.repository', () => sucursalRepo);
vi.mock('../../../server/src/modules/cxc/repositories/organizacion/ruta.repository', () => rutaRepo);
vi.mock('../../../server/src/modules/cxc/repositories/organizacion/rutaDetalle.repository', () => rutaDetalleRepo);
vi.mock('../../../server/src/modules/cxc/repositories/organizacion/rutaOperacion.repository', () => operacionRepo);
vi.mock('../../../server/src/modules/cxc/services/pagos/aplicacionPago.service', () => aplicacionService);
vi.mock('../../../server/src/modules/cxc/repositories/pagos/pago.repository', () => pagoRepo);
vi.mock('../../../server/src/modules/cxc/repositories/catalogos.repository', () => catalogos);
vi.mock('../../../server/src/modules/cxc/repositories/organizacion/zonaCobro.repository', () => zonaRepo);

import * as clientes from '../../../server/src/modules/cxc/services/organizacion/cliente.service';
import * as empresas from '../../../server/src/modules/cxc/services/organizacion/empresa.service';
import * as sucursales from '../../../server/src/modules/cxc/services/organizacion/sucursal.service';
import * as rutas from '../../../server/src/modules/cxc/services/organizacion/ruta.service';
import * as rutaDetalle from '../../../server/src/modules/cxc/services/organizacion/rutaDetalle.service';
import * as operacion from '../../../server/src/modules/cxc/services/organizacion/rutaOperacion.service';

const HOY = '2026-10-27'; // martes
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
describe('cliente.service', () => {
  const cliente = { idCliente: 1, nombre: 'Ferretería Central', nit: 'CF', idCondicion: 3, estado: 'A' };
  const datos = (extra: Record<string, unknown> = {}) => ({ nombre: 'Ferretería Central', nit: '1234567-9', direccion: 'Zona 1, Guatemala', idCondicion: 3, estado: 'A', ...extra });
  beforeEach(() => {
    clienteRepo.findById.mockResolvedValue(cliente);
    clienteRepo.findResumen.mockResolvedValue({ saldo: 0 });
    clienteRepo.create.mockResolvedValue(1);
  });

  it('list: estado inválido → 400; búsqueda recortada', async () => {
    await expect(clientes.listClientes({ estado: 'X' })).rejects.toMatchObject({ statusCode: 400 });
    clienteRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await clientes.listClientes({ estado: 'a', search: `  ${'x'.repeat(150)}  ` });
    expect(clienteRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 20, search: 'x'.repeat(100), estado: 'A' });
  });
  it('get inexistente → 404; detalle incluye validez del NIT y resumen', async () => {
    await expect(clientes.getClienteDetalle(1)).resolves.toMatchObject({ nitValido: true, resumen: { saldo: 0 } });
    clienteRepo.findById.mockResolvedValue(null);
    await expect(clientes.getCliente(1)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('crear: NIT con dígito verificador incorrecto → 400 con el campo señalado', async () => {
    await expect(clientes.createCliente(datos({ nit: '1234567-1' }))).rejects.toMatchObject({ statusCode: 400, details: [{ campo: 'nit' }] });
  });
  it('crear: NIT válido se guarda con formato; CF se guarda como CF', async () => {
    await clientes.createCliente(datos({ nit: '12345679' }));
    expect(clienteRepo.create).toHaveBeenLastCalledWith(expect.objectContaining({ nit: '1234567-9' }), undefined);
    await clientes.createCliente(datos({ nit: 'c f' }));
    expect(clienteRepo.create).toHaveBeenLastCalledWith(expect.objectContaining({ nit: 'CF' }), undefined);
  });
  it('la zona viaja con el usuario que la confirma', async () => {
    await clientes.updateCliente(1, datos({ idZona: 71 }), 4);
    expect(clienteRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ idZona: 71 }), 4);
    await clientes.createCliente(datos({ idZona: 71 }), 4);
    expect(clienteRepo.create).toHaveBeenLastCalledWith(expect.objectContaining({ idZona: 71 }), 4);
  });
  it('crear: nombre sin letras → error de validación', () => expect(clientes.createCliente(datos({ nombre: '12345' }))).rejects.toThrow(/letras/));
  it('editar: un NIT heredado inválido se conserva si no se cambia', async () => {
    clienteRepo.findById.mockResolvedValue({ ...cliente, nit: '111-1' });
    await clientes.updateCliente(1, datos({ nit: '1111' }));
    expect(clienteRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ nit: '111-1' }), undefined);
  });
  it('editar: cambiar a un NIT inválido → 400', async () => {
    await expect(clientes.updateCliente(1, datos({ nit: '1234567-1' }))).rejects.toMatchObject({ statusCode: 400 });
    expect(clienteRepo.update).not.toHaveBeenCalled();
  });
  it('editar: cambiar a un NIT válido lo formatea', async () => {
    await clientes.updateCliente(1, datos());
    expect(clienteRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ nit: '1234567-9' }), undefined);
  });
});

// ---------------------------------------------------------------------------
describe('empresa.service', () => {
  const datos = (extra: Record<string, unknown> = {}) => ({ nombre: 'Comercial Andina', giroComercial: 'Ferretería', ...extra });
  beforeEach(() => {
    empresaRepo.findById.mockResolvedValue({ idEmpresa: 1 });
    empresaRepo.findTiposComercio.mockResolvedValue(['Ferretería', 'Farmacia']);
    empresaRepo.create.mockResolvedValue(1);
  });
  it('list / get / tipos / opciones', async () => {
    empresaRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await empresas.listEmpresas({});
    await expect(empresas.listTiposComercio()).resolves.toEqual(['Ferretería', 'Farmacia']);
    empresaRepo.findAllOptions.mockResolvedValue([]);
    await expect(empresas.listEmpresaOptions()).resolves.toEqual([]);
    empresaRepo.findById.mockResolvedValue(null);
    await expect(empresas.getEmpresa(1)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('tipo de comercio: sin catálogo → pide al DBA; fuera del catálogo → 400', async () => {
    empresaRepo.findTiposComercio.mockResolvedValueOnce([]);
    await expect(empresas.createEmpresa(datos())).rejects.toThrow(/DBA/);
    await expect(empresas.createEmpresa(datos({ giroComercial: 'Panadería' }))).rejects.toThrow(/no está registrado/);
  });
  it('crear / editar sin tipo no consulta el catálogo / eliminar', async () => {
    await empresas.createEmpresa(datos());
    expect(empresaRepo.create).toHaveBeenCalled();
    empresaRepo.findTiposComercio.mockClear();
    await empresas.updateEmpresa(1, { direccion: 'Zona 4' });
    expect(empresaRepo.findTiposComercio).not.toHaveBeenCalled();
    await empresas.deleteEmpresa(1);
    expect(empresaRepo.remove).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
describe('sucursal.service', () => {
  it('CRUD', async () => {
    sucursalRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    sucursalRepo.findById.mockResolvedValue({ idSucursal: 2 });
    sucursalRepo.create.mockResolvedValue(2);
    await sucursales.listSucursales({ page: '2' });
    expect(sucursalRepo.findAll).toHaveBeenCalledWith({ page: 2, limit: 20, search: undefined });
    await sucursales.createSucursal({ idEmpresa: 1, nombre: 'Sucursal Norte', latitud: 14.6, longitud: -90.5 });
    await sucursales.updateSucursal(2, { nombre: 'Sucursal Sur' });
    await sucursales.deleteSucursal(2);
    expect(sucursalRepo.remove).toHaveBeenCalledWith(2);
    sucursalRepo.findById.mockResolvedValue(null);
    await expect(sucursales.getSucursal(2)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('coordenadas fuera de rango → error de validación', () =>
    expect(sucursales.createSucursal({ idEmpresa: 1, nombre: 'Sucursal Norte', latitud: 95, longitud: -90.5 })).rejects.toThrow());
});

// ---------------------------------------------------------------------------
describe('ruta.service', () => {
  const ruta = { idRuta: 4, idSucursal: 2, idEmpleado: 7, fecha: `${HOY}T00:00:00`, estado: 'PLANIFICADA' };
  const datos = (extra: Record<string, unknown> = {}) => ({ nombre: 'Ruta Centro', idSucursal: 2, idEmpleado: 7, fecha: HOY, idZona: 51, ...extra });
  beforeEach(() => {
    rutaRepo.findById.mockResolvedValue(ruta);
    rutaRepo.create.mockResolvedValue(4);
    rutaRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    zonaRepo.findActiva.mockResolvedValue({ id: 51, nombre: 'Villa Canales', idSucursal: null });
  });

  describe('zona de cobro', () => {
    it('una ruta nueva exige zona', () => expect(rutas.createRuta(datos({ idZona: undefined }))).rejects.toThrow(/zona de cobro/));
    it('zona inexistente o inactiva → 400 en el campo', async () => {
      zonaRepo.findActiva.mockResolvedValue(null);
      await expect(rutas.createRuta(datos())).rejects.toMatchObject({ statusCode: 400, details: [{ campo: 'idZona' }] });
      expect(rutaRepo.create).not.toHaveBeenCalled();
    });
    it('zona de otra sucursal → 400', async () => {
      zonaRepo.findActiva.mockResolvedValue({ id: 51, nombre: 'Villa Canales', idSucursal: 9 });
      await expect(rutas.createRuta(datos())).rejects.toThrow(/otra sucursal/);
    });
    it('zona sin sucursal sirve a cualquiera; se guarda con la ruta', async () => {
      await rutas.createRuta(datos());
      expect(rutaRepo.create).toHaveBeenCalledWith(expect.objectContaining({ idZona: 51 }));
    });
    it('cambiar la zona al editar la valida contra la sucursal actual', async () => {
      zonaRepo.findActiva.mockResolvedValue({ id: 52, nombre: 'Villa Nueva', idSucursal: 3 });
      await expect(rutas.updateRuta(4, { idZona: 52 })).rejects.toThrow(/otra sucursal/);
      zonaRepo.findActiva.mockResolvedValue({ id: 52, nombre: 'Villa Nueva', idSucursal: 2 });
      await rutas.updateRuta(4, { idZona: 52 });
      expect(rutaRepo.update).toHaveBeenCalledWith(4, { idZona: 52 });
    });
  });

  it('list: filtros válidos e inválidos', async () => {
    await expect(rutas.listRutas({ idEmpleado: 'x' })).rejects.toThrow(/empleado del filtro/);
    await expect(rutas.listRutas({ idSucursal: '-1' })).rejects.toThrow(/sucursal del filtro/);
    await rutas.listRutas({ idEmpleado: '7', idSucursal: '2', fecha: HOY, excluirId: '4', search: '  centro ' });
    expect(rutaRepo.findAll).toHaveBeenLastCalledWith({ page: 1, limit: 20, search: 'centro', idEmpleado: 7, idSucursal: 2, fecha: HOY, excluirId: 4 });
    await rutas.listRutas({ fecha: '27/10/2026', excluirId: '0' });
    expect(rutaRepo.findAll).toHaveBeenLastCalledWith(expect.objectContaining({ fecha: undefined, excluirId: undefined }));
  });
  it('resumen por empleado y sugerencia de sucursal', async () => {
    await rutas.listRutasPorEmpleado({ idSucursal: '' });
    expect(rutaRepo.resumenPorEmpleado).toHaveBeenCalledWith({ search: undefined, idSucursal: undefined });
    await rutas.sugerirSucursal(4);
    expect(rutaRepo.sucursalMasCercana).toHaveBeenCalledWith(4);
  });
  it('get: id inválido → 400; inexistente → 404', async () => {
    await expect(rutas.getRuta(0)).rejects.toMatchObject({ statusCode: 400 });
    rutaRepo.findById.mockResolvedValue(null);
    await expect(rutas.getRuta(4)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('createRuta', () => {
    it('debe nacer PLANIFICADA', () => expect(rutas.createRuta(datos({ estado: 'EN_CURSO' }))).rejects.toThrow(/PLANIFICADA/));
    it('fecha pasada → 400 en el campo fecha', () => expect(rutas.createRuta(datos({ fecha: '2026-10-26' }))).rejects.toMatchObject({ statusCode: 400, details: [{ campo: 'fecha' }] }));
    it('sábado o domingo → 400', async () => {
      await expect(rutas.createRuta(datos({ fecha: '2026-10-31' }))).rejects.toMatchObject({ statusCode: 400 });
      await expect(rutas.createRuta(datos({ fecha: '2026-11-01' }))).rejects.toMatchObject({ statusCode: 400 });
    });
    it('valida sucursal y empleado antes de crear', async () => {
      rutaRepo.validarSucursalYEmpleado.mockRejectedValueOnce(new Error('El empleado no pertenece a la sucursal'));
      await expect(rutas.createRuta(datos())).rejects.toThrow(/no pertenece/);
      expect(rutaRepo.create).not.toHaveBeenCalled();
      await rutas.createRuta(datos());
      expect(rutaRepo.create).toHaveBeenCalled();
    });
  });

  describe('updateRuta', () => {
    it('el estado no se cambia a mano', () => expect(rutas.updateRuta(4, { estado: 'COMPLETADA' })).rejects.toMatchObject({ statusCode: 409 }));
    it('cambiar responsable sin sucursal → 400', async () => {
      rutaRepo.findById.mockResolvedValue({ ...ruta, idSucursal: null });
      await expect(rutas.updateRuta(4, { idEmpleado: 8 })).rejects.toThrow(/Asigna una sucursal/);
    });
    it('cambiar responsable valida contra la sucursal actual', async () => {
      await rutas.updateRuta(4, { idEmpleado: 8 });
      expect(rutaRepo.validarSucursalYEmpleado).toHaveBeenCalledWith(2, 8);
    });
    it('misma fecha no se revalida (aunque ya sea pasada); una fecha nueva sí', async () => {
      rutaRepo.findById.mockResolvedValue({ ...ruta, fecha: '2026-10-20' });
      await rutas.updateRuta(4, { fecha: '2026-10-20' });
      await expect(rutas.updateRuta(4, { fecha: '2026-10-26' })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  it('finalizar y eliminar validan el id', async () => {
    await expect(rutas.finalizarRuta(0)).rejects.toMatchObject({ statusCode: 400 });
    await expect(rutas.deleteRuta(-1)).rejects.toMatchObject({ statusCode: 400 });
    await rutas.finalizarRuta(4);
    await rutas.deleteRuta(4);
    expect(rutaRepo.finalizar).toHaveBeenCalledWith(4);
    expect(rutaRepo.remove).toHaveBeenCalledWith(4);
  });
});

// ---------------------------------------------------------------------------
describe('rutaDetalle.service', () => {
  it('listar exige ruta existente', async () => {
    rutaRepo.findById.mockResolvedValue(null);
    await expect(rutaDetalle.listDetalleByRuta(4)).rejects.toMatchObject({ statusCode: 404 });
    rutaRepo.findById.mockResolvedValue({ idRuta: 4 });
    rutaDetalleRepo.findByRuta.mockResolvedValue([]);
    await expect(rutaDetalle.listDetalleByRuta(4)).resolves.toEqual([]);
  });
  it('get inexistente → 404', async () => {
    rutaDetalleRepo.findById.mockResolvedValue(null);
    await expect(rutaDetalle.getDetalle(1)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('el formato anterior no se crea ni edita; sí se elimina', async () => {
    await expect(rutaDetalle.createDetalle(4, {})).rejects.toMatchObject({ statusCode: 409 });
    await expect(rutaDetalle.updateDetalle(1, {})).rejects.toMatchObject({ statusCode: 409 });
    await rutaDetalle.deleteDetalle(1);
    expect(rutaDetalleRepo.remove).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Cobro en ruta: o el cobrador recibe el dinero, o se usa un pago ya registrado.
// ---------------------------------------------------------------------------
describe('rutaOperacion.service', () => {
  const base = (extra: Record<string, unknown> = {}) => ({ idAsignacion: 5, idEmpleado: 2, monto: 100, fecha: HOY, claveOperacion: '3f1c1b9e-4b8a-4c1e-9a55-0f1f2b3c4d5e', ...extra });
  beforeEach(() => {
    operacionRepo.documentoAsignado.mockResolvedValue({ idDocumento: 9, fechaRuta: HOY });
    catalogos.listFormasPagoActivas.mockResolvedValue([{ id: 1, label: 'Efectivo' }]);
    pagoRepo.cobrarEnRuta.mockResolvedValue(70);
    aplicacionService.getAplicacionPago.mockResolvedValue({ idAplicacion: 70 });
  });

  it('delegan con ids validados', async () => {
    expect(() => operacion.resumen('x')).toThrow();
    await operacion.resumen('4');
    expect(operacionRepo.resumen).toHaveBeenCalledWith(4);
    await operacion.pendientes('4', '1');
    expect(operacionRepo.pendientes).toHaveBeenCalledWith(4, { fueraZona: true });
    await operacion.pagosDisponibles();
    expect(operacionRepo.pendientes).toHaveBeenCalled();
  });

  it('la ruta aún no inicia → 409', async () => {
    operacionRepo.documentoAsignado.mockResolvedValue({ idDocumento: 9, fechaRuta: '2026-10-28' });
    await expect(operacion.cobrar('4', base({ idFormaPago: 1 }))).rejects.toMatchObject({ statusCode: 409 });
  });
  it('cobro con fecha anterior a la ruta → 400', async () => {
    operacionRepo.documentoAsignado.mockResolvedValue({ idDocumento: 9, fechaRuta: '2026-10-20' });
    await expect(operacion.cobrar('4', base({ idPago: 3, fecha: '2026-10-19' }))).rejects.toThrow(/anterior a la fecha de la ruta/);
  });
  it('pago ya registrado: solo se aplica a la factura asignada', async () => {
    await operacion.cobrar('4', base({ idPago: 3 }));
    expect(aplicacionService.createAplicacionPago).toHaveBeenCalledWith(expect.objectContaining({ idDocumento: 9, idPago: 3, idRutaDetalle: 5, montoAplicado: 100 }));
    expect(pagoRepo.cobrarEnRuta).not.toHaveBeenCalled();
  });
  it('pago nuevo del cobrador: solo con fecha de hoy', async () => {
    operacionRepo.documentoAsignado.mockResolvedValue({ idDocumento: 9, fechaRuta: '2026-10-20' });
    await expect(operacion.cobrar('4', base({ idFormaPago: 1, fecha: '2026-10-26' }))).rejects.toThrow(/fecha de hoy/);
  });
  it('pago nuevo con forma inactiva → 400', () => expect(operacion.cobrar('4', base({ idFormaPago: 9 }))).rejects.toThrow(/inactiva/));
  it('pago nuevo: registra y aplica en una operación y devuelve la aplicación', async () => {
    await expect(operacion.cobrar('4', base({ idFormaPago: 1 }))).resolves.toEqual({ idAplicacion: 70 });
    expect(pagoRepo.cobrarEnRuta).toHaveBeenCalledWith({
      idRutaDetalle: 5, idDocumento: 9, idFormaPago: 1, idBanco: null, monto: 100, fecha: HOY, idEmpleado: 2, claveRuta: '3f1c1b9e-4b8a-4c1e-9a55-0f1f2b3c4d5e',
    });
  });
});
