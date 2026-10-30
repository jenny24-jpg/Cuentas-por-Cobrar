import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), anular: vi.fn(), previewReferencia: vi.fn(),
}));
const catalogos = vi.hoisted(() => ({
  clienteExiste: vi.fn(), listFormasPagoActivas: vi.fn(), listMonedas: vi.fn(), bancoExiste: vi.fn(), empleadoExiste: vi.fn(),
}));
vi.mock('../../../server/src/modules/cxc/repositories/pagos/pago.repository', () => repo);
vi.mock('../../../server/src/modules/cxc/repositories/catalogos.repository', () => catalogos);

import * as service from '../../../server/src/modules/cxc/services/pagos/pago.service';

const HOY = '2026-10-27';
const pagoGuardado = { idPago: 9, idCliente: 1, idFormaPago: 2, idMoneda: 3, idBanco: null, fechaPago: `${HOY}T00:00:00`, monto: 100 };
const nuevo = (extra: Record<string, unknown> = {}) => ({ idCliente: 1, idFormaPago: 2, idMoneda: 3, fechaPago: HOY, monto: 100, ...extra });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
  catalogos.clienteExiste.mockResolvedValue(true);
  catalogos.listFormasPagoActivas.mockResolvedValue([{ id: 2, label: 'Efectivo' }]);
  catalogos.listMonedas.mockResolvedValue([{ id: 3, label: 'GTQ' }]);
  catalogos.bancoExiste.mockResolvedValue(true);
  catalogos.empleadoExiste.mockResolvedValue(true);
  repo.findById.mockResolvedValue(pagoGuardado);
  repo.create.mockResolvedValue(9);
});
afterEach(() => vi.useRealTimers());

describe('listPagos — normaliza la paginación', () => {
  it.each([
    [{}, 1, 20],
    [{ page: '-1', limit: '999' }, 1, 100],
    [{ page: '2', limit: '50', search: 'x' }, 2, 50],
  ])('%o → página %i, límite %i', async (q, page, limit) => {
    repo.findAll.mockResolvedValue({ data: [], total: 120 });
    const r = await service.listPagos(q);
    expect(repo.findAll).toHaveBeenCalledWith({ page, limit, search: (q as { search?: string }).search });
    expect(r.meta).toMatchObject({ total: 120, page, limit });
  });
});

describe('getPago', () => {
  it.each([0, -2, 1.5])('id inválido %s → 400', (id) => expect(service.getPago(id)).rejects.toMatchObject({ statusCode: 400 }));
  it('no encontrado → 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.getPago(9)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('createPago', () => {
  it.each(['2026-10-26', '2026-10-28'])('fecha distinta de hoy (%s) → 400 sin tocar la base', async (fechaPago) => {
    await expect(service.createPago(nuevo({ fechaPago }))).rejects.toThrow(/fecha actual/);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([
    ['cliente inexistente', () => catalogos.clienteExiste.mockResolvedValue(false), /cliente/],
    ['forma de pago inactiva', () => catalogos.listFormasPagoActivas.mockResolvedValue([]), /forma de pago/],
    ['moneda inexistente', () => catalogos.listMonedas.mockResolvedValue([]), /moneda/],
  ])('%s → 400', async (_n, preparar, mensaje) => {
    preparar();
    await expect(service.createPago(nuevo())).rejects.toThrow(mensaje);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('banco inexistente → 400; sin banco no se consulta', async () => {
    catalogos.bancoExiste.mockResolvedValue(false);
    await expect(service.createPago(nuevo({ idBanco: 4 }))).rejects.toThrow(/banco/);
    await service.createPago(nuevo());
    expect(catalogos.bancoExiste).toHaveBeenCalledTimes(1);
  });

  it('efectivo (sin referencia bancaria) no lleva banco; transferencia sí', async () => {
    catalogos.listFormasPagoActivas.mockResolvedValue([
      { id: 2, label: 'Efectivo', requiereReferencia: false },
      { id: 3, label: 'Transferencia Bancaria', requiereReferencia: true },
    ]);
    await expect(service.createPago(nuevo({ idBanco: 4 }))).rejects.toThrow(/Efectivo no se recibe por un banco/);
    expect(repo.create).not.toHaveBeenCalled();
    await service.createPago(nuevo({ idFormaPago: 3, idBanco: 4 }));
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ idBanco: 4 }), expect.anything());
  });

  it('pago libre: sin aplicaciones ni anticipo', async () => {
    await expect(service.createPago(nuevo())).resolves.toEqual(pagoGuardado);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ fechaPago: HOY }), { aplicaciones: [], idEmpleado: undefined, comoAnticipo: false });
  });

  it('con aplicaciones exige el empleado que registra', async () => {
    const aplicaciones = [{ idDocumento: 5, montoAplicado: 100 }];
    await expect(service.createPago(nuevo({ aplicaciones }))).rejects.toThrow(/empleado/);
    await service.createPago(nuevo({ aplicaciones, idEmpleado: 7 }));
    expect(repo.create).toHaveBeenCalledWith(expect.anything(), { aplicaciones, idEmpleado: 7, comoAnticipo: false });
  });

  it('el contrato rechaza aplicaciones que no suman el monto, duplicadas o junto con anticipo', async () => {
    await expect(service.createPago(nuevo({ aplicaciones: [{ idDocumento: 5, montoAplicado: 60 }], idEmpleado: 7 }))).rejects.toThrow(/igual al monto/);
    await expect(service.createPago(nuevo({ aplicaciones: [{ idDocumento: 5, montoAplicado: 50 }, { idDocumento: 5, montoAplicado: 50 }], idEmpleado: 7 }))).rejects.toThrow(/dos veces/);
    await expect(service.createPago(nuevo({ aplicaciones: [{ idDocumento: 5, montoAplicado: 100 }], comoAnticipo: true, idEmpleado: 7 }))).rejects.toThrow(/no ambas/);
  });

  it('como anticipo', async () => {
    await service.createPago(nuevo({ comoAnticipo: true }));
    expect(repo.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ comoAnticipo: true }));
  });
});

describe('previewReferencia', () => {
  it('devuelve el siguiente correlativo', async () => {
    repo.previewReferencia.mockResolvedValue('PAG-2026-000010');
    await expect(service.previewReferencia()).resolves.toEqual({ numeroReferencia: 'PAG-2026-000010' });
  });
});

describe('updatePago', () => {
  it('rechaza cambiar la fecha', async () => {
    await expect(service.updatePago(9, { fechaPago: '2026-10-20' })).rejects.toThrow(/no puede modificarse/);
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('misma fecha se acepta pero no se envía al repositorio; valida catálogos con los valores finales', async () => {
    await service.updatePago(9, { fechaPago: HOY, idFormaPago: 2, idBanco: null });
    expect(repo.update).toHaveBeenCalledWith(9, { idFormaPago: 2, idBanco: null });
    expect(catalogos.clienteExiste).toHaveBeenCalledWith(1);
  });
  it('catálogo inválido en la edición → 400', async () => {
    catalogos.listMonedas.mockResolvedValue([]);
    await expect(service.updatePago(9, { idMoneda: 8 })).rejects.toThrow(/moneda/);
  });
  it('pago inexistente → 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.updatePago(9, {})).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('deletePago', () => {
  it('verifica que exista y delega al repositorio', async () => {
    await service.deletePago(9);
    expect(repo.remove).toHaveBeenCalledWith(9);
  });
});

describe('anularPago', () => {
  const anulacion = { idEmpleadoAnulacion: 4, motivoAnulacion: 'Pago duplicado por error' };
  it('id inválido → 400', () => expect(service.anularPago(0, anulacion)).rejects.toMatchObject({ statusCode: 400 }));
  it('motivo corto → error de validación', () => expect(service.anularPago(9, { ...anulacion, motivoAnulacion: 'corto' })).rejects.toThrow());
  it('fecha futura → 400', () => expect(service.anularPago(9, { ...anulacion, fechaAnulacion: '2026-10-28' })).rejects.toThrow(/futura/));
  it('empleado inexistente → 400', async () => {
    catalogos.empleadoExiste.mockResolvedValue(false);
    await expect(service.anularPago(9, anulacion)).rejects.toThrow(/empleado/);
    expect(repo.anular).not.toHaveBeenCalled();
  });
  it('éxito', async () => {
    await service.anularPago(9, anulacion);
    expect(repo.anular).toHaveBeenCalledWith(9, expect.objectContaining(anulacion));
  });
});
