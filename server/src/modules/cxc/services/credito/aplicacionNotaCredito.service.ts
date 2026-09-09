import type {
  CreateAplicacionNotaCreditoInput,
  UpdateAplicacionNotaCreditoInput,
} from '@erp/contracts';
import * as repository from '../../repositories/credito/aplicacionNotaCredito.repository';

export async function list(params: {
  page: number;
  limit: number;
  search?: string;
}) {
  return repository.findAll(params);
}

export async function getOne(id: number) {
  const aplicacion = await repository.findById(id);

  if (!aplicacion) {
    throw new Error('APLICACION_NOTA_CREDITO_NOT_FOUND');
  }

  return aplicacion;
}

export async function create(
  input: CreateAplicacionNotaCreditoInput,
) {
  const id = await repository.create(input);

  return getOne(id);
}

export async function update(
  id: number,
  input: UpdateAplicacionNotaCreditoInput,
) {
  await getOne(id);

  await repository.update(id, input);

  return getOne(id);
}

export async function remove(id: number) {
  await getOne(id);

  await repository.remove(id);
}