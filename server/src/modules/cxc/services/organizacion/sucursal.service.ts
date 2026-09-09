import {
  createSucursalSchema,
  updateSucursalSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type Sucursal,
} from '@erp/contracts';
import * as sucursalRepository from '../../repositories/organizacion/sucursal.repository';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export async function listSucursales(query: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<Sucursal>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const { data, total } = await sucursalRepository.findAll({ page, limit, search: query.search });

  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getSucursal(id: number): Promise<Sucursal> {
  const sucursal = await sucursalRepository.findById(id);
  if (!sucursal) {
    throw new NotFoundError(`Sucursal ${id} no encontrada`);
  }
  return sucursal;
}

export async function createSucursal(rawInput: unknown): Promise<Sucursal> {
  const input = createSucursalSchema.parse(rawInput);
  const id = await sucursalRepository.create(input);
  return getSucursal(id);
}

export async function updateSucursal(id: number, rawInput: unknown): Promise<Sucursal> {
  const input = updateSucursalSchema.parse(rawInput);
  await getSucursal(id); // 404 temprano si no existe
  await sucursalRepository.update(id, input);
  return getSucursal(id);
}

export async function deleteSucursal(id: number): Promise<void> {
  await getSucursal(id); // 404 temprano si no existe
  await sucursalRepository.remove(id);
}
