import {
  createPromesaPagoSchema,
  updatePromesaPagoSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type PromesaPago,
} from '@erp/contracts';
import * as promesaPagoRepository from '../../repositories/cobranza/promesaPago.repository';
import { NotFoundError } from './gestionCobro.service';

export async function listPromesas(query: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<PromesaPago>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const { data, total } = await promesaPagoRepository.findAll({ page, limit, search: query.search });
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getPromesa(id: number): Promise<PromesaPago> {
  const promesa = await promesaPagoRepository.findById(id);
  if (!promesa) throw new NotFoundError(`Promesa de pago ${id} no encontrada`);
  return promesa;
}

export async function createPromesa(rawInput: unknown): Promise<PromesaPago> {
  const input = createPromesaPagoSchema.parse(rawInput);
  const id = await promesaPagoRepository.create(input);
  return getPromesa(id);
}

export async function updatePromesa(id: number, rawInput: unknown): Promise<PromesaPago> {
  const input = updatePromesaPagoSchema.parse(rawInput);
  await getPromesa(id);
  await promesaPagoRepository.update(id, input);
  return getPromesa(id);
}

export async function deletePromesa(id: number): Promise<void> {
  await getPromesa(id);
  await promesaPagoRepository.remove(id);
}
