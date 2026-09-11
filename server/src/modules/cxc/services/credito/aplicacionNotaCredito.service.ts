import { businessTodayIso } from '../../../../shared/date';
import { createAplicacionNotaCreditoSchema, updateAplicacionNotaCreditoSchema, type AplicacionNotaCredito } from '@erp/contracts';
import * as repository from '../../repositories/credito/aplicacionNotaCredito.repository';
import * as notaRepository from '../../repositories/credito/notaCredito.repository';
import * as documentoRepository from '../../repositories/documentos/documento.repository';
import { BadRequestError, NotFoundError } from '../../../../shared/errors/AppError';


async function assertRelaciones(idNotaCredito: number, idDocumento: number, montoAplicado: number, excludeId?: number) {
  const [nota, documento, yaAplicado] = await Promise.all([
    notaRepository.findById(idNotaCredito),
    documentoRepository.findById(idDocumento),
    repository.sumAplicadoPorNota(idNotaCredito, excludeId),
  ]);
  if (!nota) throw new BadRequestError('La nota de crédito seleccionada no existe');
  if (!documento) throw new BadRequestError('El documento seleccionado no existe');
  if (nota.estado !== 'ACTIVA') throw new BadRequestError('Solo se pueden aplicar notas de crédito activas');
  if (nota.idCliente !== documento.idCliente) throw new BadRequestError('La nota de crédito y el documento deben pertenecer al mismo cliente');
  if (documento.saldo <= 0) throw new BadRequestError('El documento ya no tiene saldo pendiente');
  if (montoAplicado > documento.saldo) throw new BadRequestError('El monto aplicado no puede superar el saldo del documento');
  const disponibleNota = Math.max(0, Number(nota.monto) - yaAplicado);
  if (montoAplicado > disponibleNota) throw new BadRequestError('El monto aplicado no puede superar el monto disponible de la nota de crédito');
}

export async function list(params: { page: number; limit: number; search?: string }) {
  return repository.findAll({ ...params, page: Math.max(1, params.page), limit: Math.min(100, Math.max(1, params.limit)) });
}

export async function getOne(id: number): Promise<AplicacionNotaCredito> {
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('ID de aplicación inválido');
  const aplicacion = await repository.findById(id);
  if (!aplicacion) throw new NotFoundError(`Aplicación de nota de crédito ${id} no encontrada`);
  return aplicacion;
}

export async function create(rawInput: unknown) {
  const input = createAplicacionNotaCreditoSchema.parse(rawInput);
  if (input.fechaAplicacion > businessTodayIso()) throw new BadRequestError('La fecha de aplicación no puede ser futura');
  await assertRelaciones(input.idNotaCredito, input.idDocumento, input.montoAplicado);
  const id = await repository.create(input);
  return getOne(id);
}

export async function update(id: number, rawInput: unknown) {
  const current = await getOne(id);
  const input = updateAplicacionNotaCreditoSchema.parse(rawInput);
  const finalInput = {
    idNotaCredito: input.idNotaCredito ?? current.idNotaCredito,
    idDocumento: input.idDocumento ?? current.idDocumento,
    montoAplicado: input.montoAplicado ?? current.montoAplicado,
    fechaAplicacion: input.fechaAplicacion ?? current.fechaAplicacion.slice(0, 10),
  };
  if (finalInput.fechaAplicacion > businessTodayIso()) throw new BadRequestError('La fecha de aplicación no puede ser futura');
  await assertRelaciones(finalInput.idNotaCredito, finalInput.idDocumento, finalInput.montoAplicado, id);
  await repository.update(id, input);
  return getOne(id);
}

export async function remove(id: number) {
  await getOne(id);
  await repository.remove(id);
}
