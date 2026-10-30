import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const convenioRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), createConCuotas: vi.fn(), update: vi.fn(), remove: vi.fn(), recalcularIncumplidos: vi.fn() }));
const cuotaRepo = vi.hoisted(() => ({ findByConvenio: vi.fn(), registrarPago: vi.fn() }));
const convDocRepo = vi.hoisted(() => ({ findByConvenio: vi.fn() }));
const gestionRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
const promesaRepo = vi.hoisted(() => ({ findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
const catalogos = vi.hoisted(() => ({
  clienteExiste: vi.fn(), clienteElegibleParaConvenio: vi.fn(), findDocumentoPendienteDeCliente: vi.fn(),
  listFormasPagoActivas: vi.fn(), empleadoExiste: vi.fn(),
}));
vi.mock('../../../server/src/modules/cxc/repositories/cobranza/convenioPago.repository', () => convenioRepo);
vi.mock('../../../server/src/modules/cxc/repositories/cobranza/convenioCuota.repository', () => cuotaRepo);
vi.mock('../../../server/src/modules/cxc/repositories/cobranza/convenioDocumento.repository', () => convDocRepo);
vi.mock('../../../server/src/modules/cxc/repositories/cobranza/gestionCobro.repository', () => gestionRepo);
vi.mock('../../../server/src/modules/cxc/repositories/cobranza/promesaPago.repository', () => promesaRepo);
vi.mock('../../../server/src/modules/cxc/repositories/catalogos.repository', () => catalogos);

import * as convenios from '../../../server/src/modules/cxc/services/cobranza/convenioPago.service';
import * as gestiones from '../../../server/src/modules/cxc/services/cobranza/gestionCobro.service';
import * as promesas from '../../../server/src/modules/cxc/services/cobranza/promesaPago.service';

const HOY = '2026-10-27';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
  catalogos.clienteExiste.mockResolvedValue(true);
  catalogos.clienteElegibleParaConvenio.mockResolvedValue(true);
  catalogos.findDocumentoPendienteDeCliente.mockResolvedValue({ idDocumento: 5, saldo: 1000 });
  catalogos.listFormasPagoActivas.mockResolvedValue([{ id: 1, label: 'Efectivo', requiereReferencia: false }, { id: 2, label: 'Transferencia', requiereReferencia: true }]);
  catalogos.empleadoExiste.mockResolvedValue(true);
  convenioRepo.findById.mockResolvedValue({ idConvenio: 3 });
  convenioRepo.createConCuotas.mockResolvedValue(3);
  gestionRepo.findById.mockResolvedValue({ idGestion: 7, idCliente: 1, idEmpleado: 2, idDocumento: null });
  gestionRepo.create.mockResolvedValue(7);
  promesaRepo.findById.mockResolvedValue({ idPromesa: 9, idCliente: 1, idDocumento: 5, montoComprometido: 100, fechaPromesa: `${HOY}T00:00:00`, fechaCompromiso: '2026-11-05' });
  promesaRepo.create.mockResolvedValue(9);
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
describe('convenioPago.service', () => {
  const nuevo = (extra: Record<string, unknown> = {}) => ({
    idCliente: 1, fechaConvenio: HOY, montoDeuda: 100, numeroCuotas: 3,
    documentos: [{ idDocumento: 5, montoIncluido: 100 }], ...extra,
  });

  it('list / get', async () => {
    convenioRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await convenios.listConvenios({ page: '4', limit: '10' });
    expect(convenioRepo.findAll).toHaveBeenCalledWith({ page: 4, limit: 10, search: undefined });
    await expect(convenios.getConvenio(0)).rejects.toMatchObject({ statusCode: 400 });
    convenioRepo.findById.mockResolvedValue(null);
    await expect(convenios.getConvenio(3)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('createConvenio', () => {
    it('fecha futura → 400', () => expect(convenios.createConvenio(nuevo({ fechaConvenio: '2026-10-28' }))).rejects.toThrow(/futura/));
    it('no puede nacer en otro estado', () => expect(convenios.createConvenio(nuevo({ estado: 'CUMPLIDO' }))).rejects.toThrow(/ACTIVO/));
    it('más de 18 cuotas o sin documentos → error de validación', async () => {
      await expect(convenios.createConvenio(nuevo({ numeroCuotas: 19 }))).rejects.toThrow(/18 cuotas/);
      await expect(convenios.createConvenio(nuevo({ documentos: [] }))).rejects.toThrow(/al menos un documento/);
    });
    it('cliente inexistente o no elegible → 400', async () => {
      catalogos.clienteExiste.mockResolvedValueOnce(false);
      await expect(convenios.createConvenio(nuevo())).rejects.toThrow(/no existe/);
      catalogos.clienteElegibleParaConvenio.mockResolvedValueOnce(false);
      await expect(convenios.createConvenio(nuevo())).rejects.toThrow(/promesa incumplida o una mora/);
    });
    it('documento repetido → 400', () =>
      expect(convenios.createConvenio(nuevo({ documentos: [{ idDocumento: 5, montoIncluido: 50 }, { idDocumento: 5, montoIncluido: 50 }] }))).rejects.toThrow(/dos veces/));
    it('documento ajeno o sin saldo → 400', async () => {
      catalogos.findDocumentoPendienteDeCliente.mockResolvedValue(null);
      await expect(convenios.createConvenio(nuevo())).rejects.toThrow(/no pertenece al cliente/);
    });
    it('monto incluido mayor que el saldo → 400', async () => {
      catalogos.findDocumentoPendienteDeCliente.mockResolvedValue({ idDocumento: 5, saldo: 80 });
      await expect(convenios.createConvenio(nuevo())).rejects.toThrow(/Q 80.00/);
    });
    it('la suma incluida debe igualar la deuda', () =>
      expect(convenios.createConvenio(nuevo({ montoDeuda: 120 }))).rejects.toThrow(/debe ser igual al monto de la deuda/));

    it('plan de cuotas: el residuo de centavos va a la última cuota', async () => {
      await convenios.createConvenio(nuevo());
      const plan = convenioRepo.createConCuotas.mock.calls[0][1];
      expect(plan.map((c: { monto: number }) => c.monto)).toEqual([33.33, 33.33, 33.34]);
      expect(plan.reduce((s: number, c: { monto: number }) => s + c.monto, 0)).toBeCloseTo(100, 2);
    });
    it('plan de cuotas: vence cada mes ajustando a fin de mes y cambio de año', async () => {
      vi.setSystemTime(new Date('2027-01-31T18:00:00Z'));
      await convenios.createConvenio(nuevo({ fechaConvenio: '2027-01-31', montoDeuda: 100, numeroCuotas: 3 }));
      vi.setSystemTime(new Date('2026-11-30T18:00:00Z'));
      await convenios.createConvenio(nuevo({ fechaConvenio: '2026-11-30', numeroCuotas: 2 }));
      const fechas = (i: number) => convenioRepo.createConCuotas.mock.calls[i][1].map((c: { fechaVencimiento: string }) => c.fechaVencimiento);
      expect(fechas(0)).toEqual(['2027-02-28', '2027-03-31', '2027-04-30']);
      expect(fechas(1)).toEqual(['2026-12-30', '2027-01-30']);
    });
  });

  it('documentos, cuotas, recálculo, edición y borrado', async () => {
    convDocRepo.findByConvenio.mockResolvedValue([{ idDocumento: 5 }]);
    cuotaRepo.findByConvenio.mockResolvedValue([{ idCuota: 1 }]);
    convenioRepo.recalcularIncumplidos.mockResolvedValue(2);
    await expect(convenios.getDocumentosDeConvenio(3)).resolves.toEqual([{ idDocumento: 5 }]);
    await expect(convenios.getCuotasDeConvenio(3)).resolves.toEqual([{ idCuota: 1 }]);
    await expect(convenios.recalcularConvenios()).resolves.toEqual({ actualizados: 2 });
    await convenios.updateConvenio(3, { observaciones: 'Cliente pidio cambio de fecha' });
    expect(convenioRepo.update).toHaveBeenCalledWith(3, { observaciones: 'Cliente pidio cambio de fecha' });
    await convenios.deleteConvenio(3);
    expect(convenioRepo.remove).toHaveBeenCalledWith(3);
  });

  describe('registrarPagoCuota', () => {
    const pago = (extra: Record<string, unknown> = {}) => ({ montoPagado: 33.33, idFormaPago: 1, idEmpleado: 2, ...extra });
    it('id inválido → 400', () => expect(convenios.registrarPagoCuota(0, pago())).rejects.toMatchObject({ statusCode: 400 }));
    it('forma de pago inactiva → 400', () => expect(convenios.registrarPagoCuota(1, pago({ idFormaPago: 9 }))).rejects.toThrow(/no está activa/));
    it('forma que exige referencia sin referencia → 400', () => expect(convenios.registrarPagoCuota(1, pago({ idFormaPago: 2 }))).rejects.toThrow(/requiere un número de referencia/));
    it('empleado inexistente → 400', async () => {
      catalogos.empleadoExiste.mockResolvedValue(false);
      await expect(convenios.registrarPagoCuota(1, pago())).rejects.toThrow(/empleado/);
    });
    it('éxito', async () => {
      await convenios.registrarPagoCuota(1, pago({ idFormaPago: 2, referenciaPago: 'TRX123' }));
      expect(cuotaRepo.registrarPago).toHaveBeenCalledWith(1, 33.33, 2, 'TRX123', 2);
    });
  });
});

// ---------------------------------------------------------------------------
describe('gestionCobro.service', () => {
  const nueva = (extra: Record<string, unknown> = {}) => ({ idCliente: 1, idEmpleado: 2, ...extra });

  it('list / get', async () => {
    gestionRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await gestiones.listGestiones({});
    expect(gestionRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 20, search: undefined });
    await expect(gestiones.getGestion(0)).rejects.toMatchObject({ statusCode: 400 });
    gestionRepo.findById.mockResolvedValue(null);
    await expect(gestiones.getGestion(7)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('createGestion', () => {
    it('compromiso en el pasado → 400', () => expect(gestiones.createGestion(nueva({ fechaCompromiso: '2026-10-26' }))).rejects.toThrow(/anterior a hoy/));
    it('cliente o empleado inexistente → 400', async () => {
      catalogos.clienteExiste.mockResolvedValueOnce(false);
      await expect(gestiones.createGestion(nueva())).rejects.toThrow(/cliente/);
      catalogos.empleadoExiste.mockResolvedValueOnce(false);
      await expect(gestiones.createGestion(nueva())).rejects.toThrow(/empleado/);
    });
    it('documento ajeno → 400', async () => {
      catalogos.findDocumentoPendienteDeCliente.mockResolvedValue(null);
      await expect(gestiones.createGestion(nueva({ idDocumento: 5 }))).rejects.toThrow(/saldo pendiente/);
    });
    it('sin compromiso no genera promesa', async () => {
      await gestiones.createGestion(nueva());
      expect(promesaRepo.create).not.toHaveBeenCalled();
    });
    it('con fecha y monto de compromiso genera la promesa ligada a la gestión', async () => {
      await gestiones.createGestion(nueva({ idDocumento: 5, fechaCompromiso: '2026-11-05', montoCompromiso: 150 }));
      expect(promesaRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        idCliente: 1, idDocumento: 5, idGestion: 7, fechaPromesa: HOY, fechaCompromiso: '2026-11-05', montoComprometido: 150, estado: 'PENDIENTE',
      }));
    });
    it('OBSERVACIÓN: si la promesa automática falla, la gestión se guarda igual y el error se pierde sin aviso', async () => {
      promesaRepo.create.mockRejectedValue(new Error('ORA-02290 check constraint'));
      await expect(gestiones.createGestion(nueva({ fechaCompromiso: '2026-11-05', montoCompromiso: 150 }))).resolves.toEqual(expect.objectContaining({ idGestion: 7 }));
    });
  });

  describe('updateGestion', () => {
    it('compromiso en el pasado → 400', () => expect(gestiones.updateGestion(7, { fechaCompromiso: '2026-10-01' })).rejects.toThrow(/anterior a hoy/));
    it('cambiar relaciones las revalida con los valores finales', async () => {
      await gestiones.updateGestion(7, { idDocumento: 5 });
      expect(catalogos.findDocumentoPendienteDeCliente).toHaveBeenCalledWith(1, 5);
    });
    it('cambiar solo texto no revalida', async () => {
      await gestiones.updateGestion(7, { observacion: 'Llamar el lunes' });
      expect(catalogos.clienteExiste).not.toHaveBeenCalled();
      expect(gestionRepo.update).toHaveBeenCalled();
    });
  });

  it('eliminar', async () => {
    await gestiones.deleteGestion(7);
    expect(gestionRepo.remove).toHaveBeenCalledWith(7);
  });
});

// ---------------------------------------------------------------------------
describe('promesaPago.service', () => {
  const nueva = (extra: Record<string, unknown> = {}) => ({ idCliente: 1, idDocumento: 5, fechaPromesa: HOY, fechaCompromiso: '2026-11-05', montoComprometido: 100, ...extra });

  it('list / get', async () => {
    promesaRepo.findAll.mockResolvedValue({ data: [], total: 0 });
    await promesas.listPromesas({ page: '2' });
    expect(promesaRepo.findAll).toHaveBeenCalledWith({ page: 2, limit: 20, search: undefined });
    await expect(promesas.getPromesa(0)).rejects.toMatchObject({ statusCode: 400 });
    promesaRepo.findById.mockResolvedValue(null);
    await expect(promesas.getPromesa(9)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('createPromesa', () => {
    it('fecha de promesa futura → 400', () => expect(promesas.createPromesa(nueva({ fechaPromesa: '2026-10-28', fechaCompromiso: '2026-11-05' }))).rejects.toThrow(/futura/));
    it('compromiso anterior a la promesa → rechazo', () => expect(promesas.createPromesa(nueva({ fechaCompromiso: '2026-10-20' }))).rejects.toThrow(/anterior/));
    it('documento ajeno → 400', async () => {
      catalogos.findDocumentoPendienteDeCliente.mockResolvedValue(null);
      await expect(promesas.createPromesa(nueva())).rejects.toThrow(/pertenecer al cliente/);
    });
    it('monto mayor que el saldo → 400', async () => {
      catalogos.findDocumentoPendienteDeCliente.mockResolvedValue({ idDocumento: 5, saldo: 50 });
      await expect(promesas.createPromesa(nueva())).rejects.toThrow(/superar el saldo/);
    });
    it('sin documento no valida saldo', async () => {
      await promesas.createPromesa(nueva({ idDocumento: null }));
      expect(catalogos.findDocumentoPendienteDeCliente).not.toHaveBeenCalled();
    });
  });

  describe('updatePromesa', () => {
    it('valida fechas con los valores finales', () => expect(promesas.updatePromesa(9, { fechaCompromiso: '2026-10-20' })).rejects.toThrow(/anterior/));
    it('cambiar el monto revalida contra el documento', async () => {
      catalogos.findDocumentoPendienteDeCliente.mockResolvedValue({ idDocumento: 5, saldo: 120 });
      await expect(promesas.updatePromesa(9, { montoComprometido: 150 })).rejects.toThrow(/superar el saldo/);
    });
    it('cambiar observaciones no revalida el documento', async () => {
      await promesas.updatePromesa(9, { observaciones: 'Confirmó por teléfono' });
      expect(catalogos.findDocumentoPendienteDeCliente).not.toHaveBeenCalled();
    });
  });

  it('eliminar', async () => {
    await promesas.deletePromesa(9);
    expect(promesaRepo.remove).toHaveBeenCalledWith(9);
  });
});
