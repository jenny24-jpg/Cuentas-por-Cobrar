import { businessTodayIso } from '../../../../shared/date';
import {
  createAnticipoSchema,
  updateAnticipoSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type Anticipo,
} from '@erp/contracts';
import * as repository from '../../repositories/pagos/anticipo.repository';
import * as pagoRepository from '../../repositories/pagos/pago.repository';
import { BadRequestError, NotFoundError } from '../../../../shared/errors/AppError';


export async function listAnticipos(q: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<Anticipo>> {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const { data, total } = await repository.findAll({ page, limit, search: q.search });
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getAnticipo(id: number): Promise<Anticipo> {
  const item = await repository.findById(id);
  if (!item) throw new NotFoundError(`Anticipo ${id} no encontrado`);
  return item;
}

async function assertPagoCliente(idPago: number | null | undefined, idCliente: number) {
  if (!idPago) return;
  const pago = await pagoRepository.findById(idPago);
  if (!pago) throw new BadRequestError('El pago relacionado no existe');
  if (pago.idCliente !== idCliente) {
    throw new BadRequestError('El anticipo y el pago relacionado deben pertenecer al mismo cliente');
  }
}

export async function createAnticipo(raw: unknown): Promise<Anticipo> {
  const input = createAnticipoSchema.parse(raw);
  if (input.fecha > businessTodayIso()) throw new BadRequestError('La fecha del anticipo no puede ser futura');
  await assertPagoCliente(input.idPago, input.idCliente);
  const id = await repository.create(input);
  return getAnticipo(id);
}

export async function updateAnticipo(id: number, raw: unknown): Promise<Anticipo> {
  const current = await getAnticipo(id);
  const input = updateAnticipoSchema.parse(raw);
  const finalFecha = input.fecha ?? current.fecha.slice(0, 10);
  if (finalFecha > businessTodayIso()) throw new BadRequestError('La fecha del anticipo no puede ser futura');

  const finalMontoOriginal = input.montoOriginal ?? current.montoOriginal;
  const finalMontoDisponible = input.montoDisponible ?? current.montoDisponible;
  if (finalMontoDisponible > finalMontoOriginal) {
    throw new BadRequestError('El monto disponible no puede superar el monto original');
  }

  await assertPagoCliente(input.idPago ?? current.idPago, input.idCliente ?? current.idCliente);
  await repository.update(id, input);
  return getAnticipo(id);
}

export async function deleteAnticipo(id: number): Promise<void> {
  await getAnticipo(id);
  await repository.remove(id);
}
