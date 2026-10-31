import { businessTodayIso } from '../../../../shared/date';
import { type Mora } from '@erp/contracts';
import * as repository from '../../repositories/credito/mora.repository';
import { BadRequestError, NotFoundError } from '../../../../shared/errors/AppError';

// La mora no se registra ni se edita a mano: la calcula el sistema a partir de
// los documentos vencidos y su condición de crédito (recalcular / tareas diarias).

export async function list(params: { page: number; limit: number; search?: string }) {
  return repository.findAll({ ...params, page: Math.max(1, params.page), limit: Math.min(100, Math.max(1, params.limit)) });
}

export async function getOne(id: number): Promise<Mora> {
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('ID de mora inválido');
  const mora = await repository.findById(id);
  if (!mora) throw new NotFoundError(`Registro de mora ${id} no encontrado`);
  return mora;
}

export async function recalcular() {
  return repository.recalcularPendientes();
}

/** Cartera pendiente con la mora calculada a la fecha de negocio de hoy. */
export async function cartera() {
  return repository.findCartera(businessTodayIso());
}

/** Mora de un cliente (aviso al registrar un pago). */
export async function resumenCliente(idCliente: number) {
  if (!Number.isInteger(idCliente) || idCliente <= 0) throw new BadRequestError('ID de cliente inválido');
  return repository.resumenCliente(idCliente, businessTodayIso());
}
