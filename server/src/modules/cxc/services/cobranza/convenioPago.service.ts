import { businessTodayIso } from '../../../../shared/date';
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
import * as catalogosRepository from '../../repositories/catalogos.repository';
import { BadRequestError, NotFoundError } from '../../../../shared/errors/AppError';


export async function listConvenios(query: { page?: string; limit?: string; search?: string }): Promise<PaginatedResponse<ConvenioPago>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const { data, total } = await convenioPagoRepository.findAll({ page, limit, search: query.search });
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getConvenio(id: number): Promise<ConvenioPago> {
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('ID de convenio inválido');
  const convenio = await convenioPagoRepository.findById(id);
  if (!convenio) throw new NotFoundError(`Convenio de pago ${id} no encontrado`);
  return convenio;
}

function addMonthsClamped(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const targetMonthIndex = (month - 1) + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

function generarPlanDeCuotas(montoDeuda: number, numeroCuotas: number, fechaConvenio: string) {
  const totalCentavos = Math.round(montoDeuda * 100);
  const baseCentavos = Math.floor(totalCentavos / numeroCuotas);
  const residuo = totalCentavos - baseCentavos * numeroCuotas;
  return Array.from({ length: numeroCuotas }, (_, i) => {
    const numeroCuota = i + 1;
    const centavos = baseCentavos + (i === numeroCuotas - 1 ? residuo : 0);
    return { numeroCuota, fechaVencimiento: addMonthsClamped(fechaConvenio, numeroCuota), monto: centavos / 100 };
  });
}

export async function createConvenio(rawInput: unknown): Promise<ConvenioPago> {
  const input = createConvenioPagoSchema.parse(rawInput);
  if (input.fechaConvenio > businessTodayIso()) throw new BadRequestError('La fecha del convenio no puede ser futura');
  if (!(await catalogosRepository.clienteExiste(input.idCliente))) throw new BadRequestError('El cliente seleccionado no existe');
  if (!(await catalogosRepository.clienteElegibleParaConvenio(input.idCliente))) {
    throw new BadRequestError('El cliente debe tener al menos una promesa incumplida o una mora vigente antes de generar un convenio.');
  }
  const id = await convenioPagoRepository.create(input);
  const plan = generarPlanDeCuotas(input.montoDeuda, input.numeroCuotas, input.fechaConvenio);
  try {
    await convenioCuotaRepository.bulkCreate(id, plan);
  } catch (error) {
    // Compensación para no dejar un convenio sin cuotas si falla la segunda fase.
    // La transacción única se verificará al revisar la capa Oracle/DDL.
    await convenioPagoRepository.remove(id).catch(() => undefined);
    throw error;
  }
  return getConvenio(id);
}

export async function updateConvenio(id: number, rawInput: unknown): Promise<ConvenioPago> {
  const input = updateConvenioPagoSchema.parse(rawInput);
  await getConvenio(id);
  // El repositorio solo permite editar estado/observaciones: monto, fecha y cuotas
  // quedan inmutables para no desalinear el plan generado.
  await convenioPagoRepository.update(id, input);
  return getConvenio(id);
}

export async function deleteConvenio(id: number): Promise<void> {
  await getConvenio(id);
  await convenioPagoRepository.remove(id);
}

export async function getCuotasDeConvenio(idConvenio: number): Promise<ConvenioCuota[]> {
  await getConvenio(idConvenio);
  return convenioCuotaRepository.findByConvenio(idConvenio);
}

export async function registrarPagoCuota(idCuota: number, rawInput: unknown): Promise<ConvenioCuota> {
  if (!Number.isInteger(idCuota) || idCuota <= 0) throw new BadRequestError('ID de cuota inválido');
  const input = registrarPagoCuotaSchema.parse(rawInput);
  const cuota = await convenioCuotaRepository.findById(idCuota);
  if (!cuota) throw new NotFoundError(`Cuota ${idCuota} no encontrada`);
  if (cuota.saldo <= 0 || cuota.estado === 'PAGADA') throw new BadRequestError('La cuota ya está pagada');
  if (input.montoPagado > cuota.saldo) throw new BadRequestError('El monto pagado no puede superar el saldo de la cuota');
  const formas = await catalogosRepository.listFormasPagoActivas();
  const forma = formas.find((item) => item.id === input.idFormaPago);
  if (!forma) throw new BadRequestError('La forma de pago seleccionada no está activa o no existe');
  if (forma.requiereReferencia && !input.referenciaPago) throw new BadRequestError(`${forma.label} requiere un número de referencia`);
  return convenioCuotaRepository.registrarPago(idCuota, input.montoPagado, input.idFormaPago, input.referenciaPago ?? undefined);
}
