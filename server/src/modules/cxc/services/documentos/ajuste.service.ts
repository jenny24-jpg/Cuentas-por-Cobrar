import {
  createAjusteSchema,
  updateAjusteSchema,
  buildPaginationMeta,
  type Ajuste,
  type PaginatedResponse,
} from '@erp/contracts';
import * as ajusteRepository from '../../repositories/documentos/ajuste.repository';
import { NotFoundError } from './documento.service';

export async function listAjustes(query: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<Ajuste>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const { data, total } = await ajusteRepository.findAll({ page, limit, search: query.search });
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getAjuste(id: number): Promise<Ajuste> {
  const ajuste = await ajusteRepository.findById(id);
  if (!ajuste) throw new NotFoundError(`Ajuste ${id} no encontrado`);
  return ajuste;
}

export async function createAjuste(rawInput: unknown): Promise<Ajuste> {
  const input = createAjusteSchema.parse(rawInput);
  const id = await ajusteRepository.create(input);
  return getAjuste(id);
}

export async function updateAjuste(id: number, rawInput: unknown): Promise<Ajuste> {
  const input = updateAjusteSchema.parse(rawInput);
  await getAjuste(id);
  await ajusteRepository.update(id, input);
  return getAjuste(id);
}

export async function deleteAjuste(id: number): Promise<void> {
  await getAjuste(id);
  await ajusteRepository.remove(id);
}
