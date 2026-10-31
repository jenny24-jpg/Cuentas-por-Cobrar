import {
  createCondicionCreditoSchema,
  updateCondicionCreditoSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type CondicionCredito,
} from '@erp/contracts';

import { ConflictError, NotFoundError } from '../../../../shared/errors/AppError';
import * as condicionCreditoRepository from '../../repositories/credito/condicionCredito.repository';

export async function listCondiciones(query: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<CondicionCredito>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const { data, total } = await condicionCreditoRepository.findAll({
    page,
    limit,
    search: query.search,
  });

  return {
    data,
    meta: buildPaginationMeta(total, page, limit),
  };
}

export async function getCondicion(
  id: number,
): Promise<CondicionCredito> {
  const condicion = await condicionCreditoRepository.findById(id);

  if (!condicion) {
    throw new NotFoundError(
      `Condición de crédito ${id} no encontrada`,
    );
  }

  return condicion;
}

export async function createCondicion(
  rawInput: unknown,
): Promise<CondicionCredito> {
  const input = createCondicionCreditoSchema.parse(rawInput);

  if (await condicionCreditoRepository.existeIgual(input, null)) {
    throw new ConflictError('Ya existe una condición con los mismos días de crédito, días de gracia y porcentaje de mora.');
  }

  const id = await condicionCreditoRepository.create(input);

  return getCondicion(id);
}

export async function updateCondicion(
  id: number,
  rawInput: unknown,
): Promise<CondicionCredito> {
  const input = updateCondicionCreditoSchema.parse(rawInput);
  const actual = await getCondicion(id);

  const cambiaTerminos =
    (input.diasCredito !== undefined && input.diasCredito !== actual.diasCredito) ||
    (input.diasGracia !== undefined && input.diasGracia !== actual.diasGracia) ||
    (input.porcentajeMora !== undefined && Number(input.porcentajeMora) !== Number(actual.porcentajeMora));

  if (cambiaTerminos) {
    // Los documentos ya emitidos se rigen por los términos con que se emitieron:
    // cambiar una condición en uso alteraría su vencimiento y su mora hacia atrás.
    const uso = await condicionCreditoRepository.contarUso(id);
    if (uso.clientes > 0 || uso.documentos > 0) {
      throw new ConflictError(
        `Esta condición está en uso ( cliente(s),  documento(s)); sus días y porcentaje no se cambian. Crea una condición nueva e inactiva esta si ya no debe usarse.`,
      );
    }

    const terminos = {
      diasCredito: input.diasCredito ?? actual.diasCredito,
      diasGracia: input.diasGracia ?? actual.diasGracia,
      porcentajeMora: input.porcentajeMora ?? actual.porcentajeMora,
    };
    if (await condicionCreditoRepository.existeIgual(terminos, id)) {
      throw new ConflictError('Ya existe una condición con los mismos días de crédito, días de gracia y porcentaje de mora.');
    }
  }

  await condicionCreditoRepository.update(id, input);

  return getCondicion(id);
}

export async function deleteCondicion(id: number): Promise<void> {
  await condicionCreditoRepository.remove(id);
}
