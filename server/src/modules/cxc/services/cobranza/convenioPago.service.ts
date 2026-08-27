import {
  createConvenioPagoSchema,
  updateConvenioPagoSchema,
  registrarPagoCuotaSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type ConvenioPago,
  type ConvenioCuota,
} from '@erp/contracts';
import * as convenioPagoRepository from '../../repositories/cobranza/convenioPago.repository';
import * as convenioCuotaRepository from '../../repositories/cobranza/convenioCuota.repository';
import { NotFoundError } from './gestionCobro.service';

export async function listConvenios(query: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<ConvenioPago>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const { data, total } = await convenioPagoRepository.findAll({ page, limit, search: query.search });
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getConvenio(id: number): Promise<ConvenioPago> {
  const convenio = await convenioPagoRepository.findById(id);
  if (!convenio) throw new NotFoundError(`Convenio de pago ${id} no encontrado`);
  return convenio;
}

/**
 * Genera las cuotas de un convenio distribuyendo el monto de la deuda en
 * partes iguales, con vencimiento mensual a partir de la fecha del convenio.
 * La última cuota absorbe el residuo del redondeo, para que la suma de
 * todas las cuotas sea exactamente igual a montoDeuda (nunca falte ni sobre
 * por centavos).
 */
function generarPlanDeCuotas(
  montoDeuda: number,
  numeroCuotas: number,
  fechaConvenio: string,
): Array<{ numeroCuota: number; fechaVencimiento: string; monto: number }> {
  const montoBase = Math.floor((montoDeuda / numeroCuotas) * 100) / 100;
  const fechaBase = new Date(fechaConvenio);

  return Array.from({ length: numeroCuotas }, (_, i) => {
    const numeroCuota = i + 1;
    const esUltima = numeroCuota === numeroCuotas;

    const montoAcumuladoPrevio = montoBase * (numeroCuotas - 1);
    const monto = esUltima
      ? Math.round((montoDeuda - montoAcumuladoPrevio) * 100) / 100
      : montoBase;

    const fechaVencimiento = new Date(fechaBase);
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + numeroCuota);

    return {
      numeroCuota,
      fechaVencimiento: fechaVencimiento.toISOString().slice(0, 10),
      monto,
    };
  });
}

export async function createConvenio(rawInput: unknown): Promise<ConvenioPago> {
  const input = createConvenioPagoSchema.parse(rawInput);
  const id = await convenioPagoRepository.create(input);

  const plan = generarPlanDeCuotas(input.montoDeuda, input.numeroCuotas, input.fechaConvenio);
  await convenioCuotaRepository.bulkCreate(id, plan);
  // Nota: la creación del convenio y la generación de cuotas son dos
  // transacciones separadas (cada repositorio hace su propio commit). Si el
  // servidor cae justo entre ambas, quedaría un convenio sin cuotas. Para
  // este alcance académico es un riesgo aceptable; si se quiere blindar,
  // el siguiente paso es pasar una única Connection compartida entre los
  // dos repositorios y commitear una sola vez al final.

  return getConvenio(id);
}

export async function updateConvenio(id: number, rawInput: unknown): Promise<ConvenioPago> {
  const input = updateConvenioPagoSchema.parse(rawInput);
  await getConvenio(id);
  await convenioPagoRepository.update(id, input);
  return getConvenio(id);
}

export async function deleteConvenio(id: number): Promise<void> {
  await getConvenio(id);
  await convenioPagoRepository.remove(id);
}

export async function getCuotasDeConvenio(idConvenio: number): Promise<ConvenioCuota[]> {
  await getConvenio(idConvenio); // 404 si el convenio no existe
  return convenioCuotaRepository.findByConvenio(idConvenio);
}

export async function registrarPagoCuota(idCuota: number, rawInput: unknown): Promise<ConvenioCuota> {
  const input = registrarPagoCuotaSchema.parse(rawInput);
  return convenioCuotaRepository.registrarPago(idCuota, input.montoPagado);
}
