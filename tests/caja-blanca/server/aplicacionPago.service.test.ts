import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), reversar: vi.fn() }));
const catalogos = vi.hoisted(() => ({ empleadoExiste: vi.fn(async () => true) }));
vi.mock('../../../server/src/modules/cxc/repositories/pagos/aplicacionPago.repository', () => repo);
vi.mock('../../../server/src/modules/cxc/repositories/catalogos.repository', () => catalogos);

import * as service from '../../../server/src/modules/cxc/services/pagos/aplicacionPago.service';

const valido = { idPago: 1, idDocumento: 2, fechaAplicacion: '2026-10-27', montoAplicado: 10, idEmpleado: 5 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
  repo.findById.mockResolvedValue({ idAplicacion: 9 });
});
afterEach(() => vi.useRealTimers());

describe('listAplicacionesPago — normaliza la paginación', () => {
  it.each([
    [{}, 1, 20],
    [{ page: '0', limit: '0' }, 1, 20],
    [{ page: '-3', limit: '500' }, 1, 100],
    [{ page: 'abc', limit: 'x' }, 1, 20],
    [{ page: '3', limit: '10' }, 3, 10],
  ])('%o → página %i, límite %i', async (q, page, limit) => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 });
    await service.listAplicacionesPago(q);
    expect(repo.findAll).toHaveBeenCalledWith({ page, limit, search: undefined });
  });
});

describe('getAplicacionPago', () => {
  it.each([0, -1, 1.5, Number.NaN])('id inválido %s → 400', async (id) => {
    await expect(service.getAplicacionPago(id)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('no encontrada → 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.getAplicacionPago(9)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('createAplicacionPago', () => {
  it('esquema inválido → ZodError antes del repositorio', async () => {
    await expect(service.createAplicacionPago({ ...valido, montoAplicado: -1 })).rejects.toHaveProperty('issues');
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('detalle de ruta sin clave (o al revés) → 400', async () => {
    await expect(service.createAplicacionPago({ ...valido, idRutaDetalle: 3 })).rejects.toThrow(/detalle y clave/);
  });
  it('fecha futura → 400', async () => {
    await expect(service.createAplicacionPago({ ...valido, fechaAplicacion: '2026-10-28' })).rejects.toThrow(/futura/);
  });
  it('empleado inexistente → 400', async () => {
    catalogos.empleadoExiste.mockResolvedValueOnce(false);
    await expect(service.createAplicacionPago(valido)).rejects.toThrow(/empleado seleccionado no existe/);
  });
  it('válida: crea y devuelve la aplicación', async () => {
    repo.create.mockResolvedValue(9);
    await expect(service.createAplicacionPago(valido)).resolves.toEqual({ idAplicacion: 9 });
    expect(repo.findById).toHaveBeenCalledWith(9);
  });
});

describe('aplicaciones confirmadas son inmutables', () => {
  it('update y delete siempre → 409', async () => {
    await expect(service.updateAplicacionPago(1, {})).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.deleteAplicacionPago(1)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('reversarAplicacionPago', () => {
  const reversa = { idEmpleadoReversa: 5, motivoReversa: 'Se aplicó al documento equivocado' };
  it('id inválido', async () => {
    await expect(service.reversarAplicacionPago(0, reversa)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('fecha futura', async () => {
    await expect(service.reversarAplicacionPago(9, { ...reversa, fechaReversa: '2026-10-28' })).rejects.toThrow(/futura/);
  });
  it('empleado inexistente', async () => {
    catalogos.empleadoExiste.mockResolvedValueOnce(false);
    await expect(service.reversarAplicacionPago(9, reversa)).rejects.toThrow(/empleado/);
  });
  it('válida: delega en el repositorio y devuelve el registro actualizado', async () => {
    await service.reversarAplicacionPago(9, reversa);
    expect(repo.reversar).toHaveBeenCalledWith(9, expect.objectContaining(reversa));
  });
});
