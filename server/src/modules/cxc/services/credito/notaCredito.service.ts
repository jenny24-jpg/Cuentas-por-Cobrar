import type {
  CreateNotaCreditoInput,
  UpdateNotaCreditoInput,
} from '@erp/contracts';
import * as repository from '../../repositories/credito/notaCredito.repository';

export async function list(params: {
  page: number;
  limit: number;
  search?: string;
}) {
  return repository.findAll(params);
}

export async function getOne(id: number) {
  const nota = await repository.findById(id);

  if (!nota) {
    throw new Error('NOTA_CREDITO_NOT_FOUND');
  }

  return nota;
}

export async function create(input: CreateNotaCreditoInput) {
  const id = await repository.create(input);
  return getOne(id);
}

export async function update(
  id: number,
  input: UpdateNotaCreditoInput,
) {
  await getOne(id);
  await repository.update(id, input);
  return getOne(id);
}

export async function remove(id: number) {
  await getOne(id);
  await repository.remove(id);
}