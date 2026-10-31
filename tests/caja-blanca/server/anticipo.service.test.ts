import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), anular: vi.fn(), reversar: vi.fn() }));
const pagoRepo = vi.hoisted(() => ({ findById: vi.fn() }));
const aplicacionRepo = vi.hoisted(() => ({ sumAplicadoPorAnticipo: vi.fn(), findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), reversar: vi.fn() }));
const formaRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), existeNombre: vi.fn() }));
const catalogos = vi.hoisted(() => ({ empleadoExiste: vi.fn() }));
vi.mock('../../../server/src/modules/cxc/repositories/pagos/anticipo.repository', () => repo);
vi.mock('../../../server/src/modules/cxc/repositories/pagos/pago.repository', () => pagoRepo);
vi.mock('../../../server/src/modules/cxc/repositories/pagos/aplicacionAnticipo.repository', () => aplicacionRepo);
vi.mock('../../../server/src/modules/cxc/repositories/pagos/formaPago.repository', () => formaRepo);
vi.mock('../../../server/src/modules/cxc/repositories/catalogos.repository', () => catalogos);

import * as anticipos from '../../../server/src/modules/cxc/services/pagos/anticipo.service';
import * as aplicaciones from '../../../server/src/modules/cxc/services/pagos/aplicacionAnticipo.service';
import * as formas from '../../../server/src/modules/cxc/services/pagos/formaPago.service';

const HOY = '2026-10-27';
const anticipo = { idAnticipo: 4, idCliente: 1, idPago: 9, fecha: `${HOY}T00:00:00`, estado: 'DISPONIBLE', montoOriginal: 100, montoDisponible: 100 };
const pago = { idPago: 9, idCliente: 1, estado: 'NO_APLICADO', fechaPago: `${HOY}T00:00:00` };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
  repo.findById.mockResolvedValue(anticipo);
  repo.create.mockResolvedValue(4);
  pagoRepo.findById.mockResolvedValue(pago);
  aplicacionRepo.sumAplicadoPorAnticipo.mockResolvedValue(0);
  aplicacionRepo.findById.mockResolvedValue({ idAplicacion: 3 });
  aplicacionRepo.create.mockResolvedValue(3);
  catalogos.empleadoExiste.mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
describe('anticipo.service', () => {
  it('lista con paginación acotada', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 });
    await anticipos.listAnticipos({ page: '0', limit: '1000' });
    expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 100, search: undefined });
  });

  it.each([0, 2.5])('getAnticipo id inválido %s → 400', (id) => expect(anticipos.getAnticipo(id)).rejects.toMatchObject({ statusCode: 400 }));
  it('getAnticipo inexistente → 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(anticipos.getAnticipo(4)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('createAnticipo', () => {
    const datos = (extra: Record<string, unknown> = {}) => ({ idCliente: 1, idPago: 9, fecha: HOY, ...extra });
    it('fecha distinta de hoy → 400', () => expect(anticipos.createAnticipo(datos({ fecha: '2026-10-26' }))).rejects.toThrow(/fecha actual/));
    it('sin pago que lo respalde → error de validación', () => expect(anticipos.createAnticipo({ idCliente: 1, fecha: HOY })).rejects.toThrow(/pago que respalda/));
    it('pago inexistente → 400', async () => {
      pagoRepo.findById.mockResolvedValue(null);
      await expect(anticipos.createAnticipo(datos())).rejects.toThrow(/no existe/);
    });
    it('pago de otro cliente → 400', async () => {
      pagoRepo.findById.mockResolvedValue({ ...pago, idCliente: 2 });
      await expect(anticipos.createAnticipo(datos())).rejects.toThrow(/mismo cliente/);
    });
    it.each(['ANULADO', ' reversado '])('pago %s → 409', async (estado) => {
      pagoRepo.findById.mockResolvedValue({ ...pago, estado });
      await expect(anticipos.createAnticipo(datos())).rejects.toMatchObject({ statusCode: 409 });
    });
    it('pago posterior al anticipo → 400', async () => {
      pagoRepo.findById.mockResolvedValue({ ...pago, fechaPago: '2026-10-28' });
      await expect(anticipos.createAnticipo(datos())).rejects.toThrow(/anterior a la fecha del pago/);
    });
    it('éxito: la fecha la fija el servidor', async () => {
      await expect(anticipos.createAnticipo(datos())).resolves.toEqual(anticipo);
      expect(repo.create).toHaveBeenCalledWith({ idCliente: 1, idPago: 9, fecha: HOY });
    });
  });

  describe('updateAnticipo', () => {
    it('solo DISPONIBLE', async () => {
      repo.findById.mockResolvedValue({ ...anticipo, estado: 'AGOTADO' });
      await expect(anticipos.updateAnticipo(4, {})).rejects.toMatchObject({ statusCode: 409 });
    });
    it('con aplicaciones → 409', async () => {
      aplicacionRepo.sumAplicadoPorAnticipo.mockResolvedValue(10);
      await expect(anticipos.updateAnticipo(4, {})).rejects.toThrow(/ya tiene aplicaciones/);
    });
    it('no permite cambiar la fecha', () => expect(anticipos.updateAnticipo(4, { fecha: '2026-10-20' })).rejects.toThrow(/no puede modificarse/));
    it('revalida el pago con el cliente final y no envía la fecha', async () => {
      await anticipos.updateAnticipo(4, { fecha: HOY, idPago: 9 });
      expect(pagoRepo.findById).toHaveBeenCalledWith(9);
      expect(repo.update).toHaveBeenCalledWith(4, { idPago: 9 });
    });
    it('un anticipo heredado sin pago no consulta pagos', async () => {
      repo.findById.mockResolvedValue({ ...anticipo, idPago: null });
      await anticipos.updateAnticipo(4, {});
      expect(pagoRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('deleteAnticipo', () => {
    it('aplicado → 409', async () => {
      aplicacionRepo.sumAplicadoPorAnticipo.mockResolvedValue(1);
      await expect(anticipos.deleteAnticipo(4)).rejects.toThrow(/aplicado no se elimina/);
    });
    it('no disponible → 409', async () => {
      repo.findById.mockResolvedValue({ ...anticipo, estado: 'CANCELADO' });
      await expect(anticipos.deleteAnticipo(4)).rejects.toThrow(/disponible y sin aplicaciones/);
    });
    it('éxito', async () => {
      await anticipos.deleteAnticipo(4);
      expect(repo.remove).toHaveBeenCalledWith(4);
    });
  });

  describe('anularAnticipo', () => {
    const datos = { idEmpleadoAnulacion: 2, motivoAnulacion: 'Cliente desistió de la compra' };
    it('id inválido → 400', () => expect(anticipos.anularAnticipo(-1, datos)).rejects.toMatchObject({ statusCode: 400 }));
    it('fecha futura → 400', () => expect(anticipos.anularAnticipo(4, { ...datos, fechaAnulacion: '2026-11-01' })).rejects.toThrow(/futura/));
    it('empleado inexistente → 400', async () => {
      catalogos.empleadoExiste.mockResolvedValue(false);
      await expect(anticipos.anularAnticipo(4, datos)).rejects.toThrow(/empleado/);
    });
    it('éxito', async () => {
      await anticipos.anularAnticipo(4, datos);
      expect(repo.anular).toHaveBeenCalledWith(4, expect.objectContaining(datos));
    });
  });
});

// ---------------------------------------------------------------------------
describe('aplicacionAnticipo.service', () => {
  const datos = (extra: Record<string, unknown> = {}) => ({ idAnticipo: 4, idDocumento: 5, montoAplicado: 50, fechaAplicacion: HOY, idEmpleado: 2, ...extra });

  it('lista con paginación', async () => {
    aplicacionRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await aplicaciones.listAplicacionesAnticipo({ page: '3', limit: '25' });
    expect(aplicacionRepo.findAll).toHaveBeenCalledWith({ page: 3, limit: 25, search: undefined });
  });
  it('get id inválido / inexistente', async () => {
    await expect(aplicaciones.getAplicacionAnticipo(0)).rejects.toMatchObject({ statusCode: 400 });
    aplicacionRepo.findById.mockResolvedValue(null);
    await expect(aplicaciones.getAplicacionAnticipo(3)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('crear con fecha distinta de hoy → 400', () => expect(aplicaciones.createAplicacionAnticipo(datos({ fechaAplicacion: '2026-10-28' }))).rejects.toThrow(/fecha actual/));
  it('crear con empleado inexistente → 400', async () => {
    catalogos.empleadoExiste.mockResolvedValue(false);
    await expect(aplicaciones.createAplicacionAnticipo(datos())).rejects.toThrow(/empleado/);
  });
  it('crear éxito', async () => {
    await aplicaciones.createAplicacionAnticipo(datos());
    expect(aplicacionRepo.create).toHaveBeenCalledWith(datos());
  });
  it('editar o eliminar una aplicación confirmada → 409', async () => {
    await expect(aplicaciones.updateAplicacionAnticipo(3, {})).rejects.toMatchObject({ statusCode: 409 });
    await expect(aplicaciones.deleteAplicacionAnticipo(3)).rejects.toMatchObject({ statusCode: 409 });
  });
  describe('reversar', () => {
    const rev = { idEmpleadoReversa: 2, motivoReversa: 'Aplicada al documento equivocado' };
    it('id inválido → 400', () => expect(aplicaciones.reversarAplicacionAnticipo(0, rev)).rejects.toMatchObject({ statusCode: 400 }));
    it('fecha futura → 400', () => expect(aplicaciones.reversarAplicacionAnticipo(3, { ...rev, fechaReversa: '2026-10-30' })).rejects.toThrow(/futura/));
    it('empleado inexistente → 400', async () => {
      catalogos.empleadoExiste.mockResolvedValue(false);
      await expect(aplicaciones.reversarAplicacionAnticipo(3, rev)).rejects.toThrow(/empleado/);
    });
    it('éxito', async () => {
      await aplicaciones.reversarAplicacionAnticipo(3, rev);
      expect(aplicacionRepo.reversar).toHaveBeenCalledWith(3, expect.objectContaining(rev));
    });
  });
});

// ---------------------------------------------------------------------------
describe('formaPago.service', () => {
  const forma = { nombre: 'Transferencia', requiereReferencia: 'S', estado: 'A' };
  beforeEach(() => {
    formaRepo.findById.mockResolvedValue({ id: 1, ...forma });
    formaRepo.existeNombre.mockResolvedValue(false);
    formaRepo.create.mockResolvedValue(1);
  });
  it('lista con paginación', async () => {
    formaRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await formas.listFormasPago({});
    expect(formaRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 20, search: undefined });
  });
  it('get inexistente → 404', async () => {
    formaRepo.findById.mockResolvedValue(null);
    await expect(formas.getFormaPago(1)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('nombre con números → error de validación', () => expect(formas.createFormaPago({ ...forma, nombre: 'Tarjeta 2' })).rejects.toThrow(/letras/));
  it('nombre duplicado → 409', async () => {
    formaRepo.existeNombre.mockResolvedValue(true);
    await expect(formas.createFormaPago(forma)).rejects.toMatchObject({ statusCode: 409 });
    expect(formaRepo.create).not.toHaveBeenCalled();
  });
  it('crear éxito', async () => {
    await formas.createFormaPago(forma);
    expect(formaRepo.create).toHaveBeenCalledWith(forma);
  });
  it('renombrar a uno existente → 409; se excluye a sí misma', async () => {
    formaRepo.existeNombre.mockResolvedValue(true);
    await expect(formas.updateFormaPago(1, { nombre: 'Efectivo' })).rejects.toMatchObject({ statusCode: 409 });
    expect(formaRepo.existeNombre).toHaveBeenCalledWith('Efectivo', 1);
  });
  it('editar sin nombre no valida duplicados', async () => {
    await formas.updateFormaPago(1, { estado: 'I' });
    expect(formaRepo.existeNombre).not.toHaveBeenCalled();
    expect(formaRepo.update).toHaveBeenCalledWith(1, { estado: 'I' });
  });
  it('eliminar', async () => {
    await formas.deleteFormaPago(1);
    expect(formaRepo.remove).toHaveBeenCalledWith(1);
  });
});
