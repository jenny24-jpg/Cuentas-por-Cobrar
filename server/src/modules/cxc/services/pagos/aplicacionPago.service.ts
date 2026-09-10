import {
  createAplicacionPagoSchema,
  updateAplicacionPagoSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type AplicacionPago,
} from '@erp/contracts';
import * as repository from '../../repositories/pagos/aplicacionPago.repository';
import * as pagoRepository from '../../repositories/pagos/pago.repository';
import * as documentoRepository from '../../repositories/documentos/documento.repository';
import { BadRequestError, NotFoundError } from '../../../../shared/errors/AppError';

export async function listAplicacionesPago(q: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<AplicacionPago>> {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const { data, total } = await repository.findAll({ page, limit, search: q.search });
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getAplicacionPago(id: number): Promise<AplicacionPago> {
  const item = await repository.findById(id);
  if (!item) throw new NotFoundError(`Aplicación de pago ${id} no encontrada`);
  return item;
}

async function assertRelaciones(idPago: number, idDocumento: number, montoAplicado: number, excludeId?: number) {
  const [pago, documento, yaAplicado] = await Promise.all([
    pagoRepository.findById(idPago),
    documentoRepository.findById(idDocumento),
    repository.sumAplicadoPorPago(idPago, excludeId),
  ]);

  if (!pago) throw new BadRequestError('El pago seleccionado no existe');
  if (!documento) throw new BadRequestError('El documento seleccionado no existe');

  if (pago.idCliente !== documento.idCliente) {
    throw new BadRequestError('El pago y el documento deben pertenecer al mismo cliente');
  }

  if (documento.saldo <= 0) {
    throw new BadRequestError('El documento seleccionado ya no tiene saldo pendiente');
  }

  if (montoAplicado > documento.saldo) {
    throw new BadRequestError('El monto aplicado no puede superar el saldo del documento');
  }

  const disponiblePago = Math.max(0, Number(pago.monto) - yaAplicado);
  if (montoAplicado > disponiblePago) {
    throw new BadRequestError('El monto aplicado no puede superar el monto disponible del pago');
  }
}

export async function createAplicacionPago(raw: unknown): Promise<AplicacionPago> {
  const input = createAplicacionPagoSchema.parse(raw);
  await assertRelaciones(input.idPago, input.idDocumento, input.montoAplicado);
  const id = await repository.create(input);
  return getAplicacionPago(id);
}

export async function updateAplicacionPago(id: number, raw: unknown): Promise<AplicacionPago> {
  const current = await getAplicacionPago(id);
  const input = updateAplicacionPagoSchema.parse(raw);
  const finalInput = {
    idPago: input.idPago ?? current.idPago,
    idDocumento: input.idDocumento ?? current.idDocumento,
    montoAplicado: input.montoAplicado ?? current.montoAplicado,
  };
  await assertRelaciones(finalInput.idPago, finalInput.idDocumento, finalInput.montoAplicado, id);
  await repository.update(id, input);
  return getAplicacionPago(id);
}

export async function deleteAplicacionPago(id: number): Promise<void> {
  await getAplicacionPago(id);
  await repository.remove(id);
}
