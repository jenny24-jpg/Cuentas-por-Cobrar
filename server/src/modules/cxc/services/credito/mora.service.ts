import type {
  CreateMoraInput,
  UpdateMoraInput,
} from '@erp/contracts';
import * as repository from '../../repositories/credito/mora.repository';

export async function list(params: {
  page: number;
  limit: number;
  search?: string;
}) {
  return repository.findAll(params);
}

export async function getOne(id: number) {
  const mora = await repository.findById(id);

  if (!mora) {
    throw new Error('MORA_NOT_FOUND');
  }

  return mora;
}

export async function create(
  input: CreateMoraInput,
) {
  const id = await repository.create(input);

  return getOne(id);
}

export async function update(
  id: number,
  input: UpdateMoraInput,
) {
  await getOne(id);

  await repository.update(id, input);

  return getOne(id);
}

export async function remove(id: number) {
  await getOne(id);

  await repository.remove(id);
}