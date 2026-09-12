import { businessTodayIso } from '../../../../shared/date';
import {
  createAplicacionNotaCreditoSchema,
  type AplicacionNotaCredito,
} from '@erp/contracts';
import * as repository from '../../repositories/credito/aplicacionNotaCredito.repository';
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/errors/AppError';

export async function list(params: { page: number; limit: number; search?: string }) {
  return repository.findAll({
    ...params,
    page: Math.max(1, params.page),
    limit: Math.min(100, Math.max(1, params.limit)),
  });
}

export async function getOne(id: number): Promise<AplicacionNotaCredito> {
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('ID de aplicación inválido');
  const aplicacion = await repository.findById(id);
  if (!aplicacion) throw new NotFoundError(`Aplicación de nota de crédito ${id} no encontrada`);
  return aplicacion;
}

export async function create(rawInput: unknown) {
  const input = createAplicacionNotaCreditoSchema.parse(rawInput);
  if (input.fechaAplicacion > businessTodayIso()) {
    throw new BadRequestError('La fecha de aplicación no puede ser futura');
  }

  const id = await repository.create(input);
  return getOne(id);
}

export async function update(_id: number, _rawInput: unknown) {
  throw new ConflictError(
    'Una aplicación de nota de crédito confirmada no se edita. Debe reversarse mediante el flujo financiero de reversión.',
  );
}

export async function remove(_id: number) {
  throw new ConflictError(
    'Una aplicación de nota de crédito confirmada no se elimina físicamente. Debe reversarse para conservar trazabilidad.',
  );
}
