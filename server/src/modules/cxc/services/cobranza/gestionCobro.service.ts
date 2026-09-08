import {
  createGestionCobroSchema,
  updateGestionCobroSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type GestionCobro,
} from '@erp/contracts';
import * as gestionCobroRepository from '../../repositories/cobranza/gestionCobro.repository';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export async function listGestiones(query: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<GestionCobro>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const { data, total } = await gestionCobroRepository.findAll({
    page,
    limit,
    search: query.search,
  });

  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getGestion(id: number): Promise<GestionCobro> {
  const gestion = await gestionCobroRepository.findById(id);
  if (!gestion) {
    throw new NotFoundError(`Gestión de cobro ${id} no encontrada`);
  }
  return gestion;
}

export async function createGestion(rawInput: unknown): Promise<GestionCobro> {
  const input = createGestionCobroSchema.parse(rawInput);
  const id = await gestionCobroRepository.create(input);
  return getGestion(id);
}

export async function updateGestion(id: number, rawInput: unknown): Promise<GestionCobro> {
  const input = updateGestionCobroSchema.parse(rawInput);
  await getGestion(id); // 404 temprano si no existe
  await gestionCobroRepository.update(id, input);
  return getGestion(id);
}

export async function deleteGestion(id: number): Promise<void> {
  await getGestion(id); // 404 temprano si no existe
  await gestionCobroRepository.remove(id);
}
