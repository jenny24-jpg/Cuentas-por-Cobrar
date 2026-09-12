import {
  createAjusteSchema,
  updateAjusteSchema,
  buildPaginationMeta,
  type Ajuste,
  type PaginatedResponse,
} from '@erp/contracts';
import * as ajusteRepository from '../../repositories/documentos/ajuste.repository';
import * as documentoRepository from '../../repositories/documentos/documento.repository';
import { BadRequestError, NotFoundError } from '../../../../shared/errors/AppError';

export async function listAjustes(query: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<Ajuste>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const { data, total } = await ajusteRepository.findAll({ page, limit, search: query.search });
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getAjuste(id: number): Promise<Ajuste> {
  const ajuste = await ajusteRepository.findById(id);
  if (!ajuste) throw new NotFoundError(`Ajuste ${id} no encontrado`);
  return ajuste;
}

async function validateDocumentRelation(
  idCliente: number,
  idDocumento: number | null | undefined,
  tipoAjuste: string,
  monto: number,
) {
  if (!idDocumento) return;
  const documento = await documentoRepository.findById(idDocumento);
  if (!documento) throw new BadRequestError('El documento seleccionado no existe');
  if (documento.idCliente !== idCliente) {
    throw new BadRequestError('El documento debe pertenecer al cliente seleccionado');
  }
  if (['PAGADO', 'PAGADA', 'ANULADO', 'ANULADA'].includes(String(documento.estado).toUpperCase())) {
    throw new BadRequestError('No se puede registrar un ajuste sobre un documento pagado o anulado');
  }
  if (tipoAjuste === 'CREDITO' && monto > Number(documento.saldo) + 0.005) {
    throw new BadRequestError('Un ajuste crédito no puede superar el saldo pendiente del documento');
  }
}

export async function createAjuste(rawInput: unknown): Promise<Ajuste> {
  const input = createAjusteSchema.parse(rawInput);
  await validateDocumentRelation(input.idCliente, input.idDocumento, input.tipoAjuste, input.monto);

  // IMPORTANTE: por definición de negocio, registrar el ajuste NO altera el
  // saldo todavía. El efecto financiero ocurrirá al aprobarlo, cuando el DDL
  // incorpore estado/aprobaciones/auditoría.
  const id = await ajusteRepository.create(input);
  return getAjuste(id);
}

export async function updateAjuste(id: number, rawInput: unknown): Promise<Ajuste> {
  const current = await getAjuste(id);
  const input = updateAjusteSchema.parse(rawInput);

  const idCliente = input.idCliente ?? current.idCliente;
  const idDocumento = input.idDocumento === undefined ? current.idDocumento : input.idDocumento;
  const tipoAjuste = input.tipoAjuste ?? current.tipoAjuste;
  const monto = input.monto ?? current.monto;
  await validateDocumentRelation(idCliente, idDocumento, tipoAjuste, monto);

  await ajusteRepository.update(id, input);
  return getAjuste(id);
}

export async function deleteAjuste(id: number): Promise<void> {
  await getAjuste(id);
  // Mientras no exista ESTADO/APROBACION en Oracle, estos registros son
  // solicitudes pendientes y pueden corregirse/eliminarse. Al agregar el
  // flujo APROBADO/RECHAZADO/ANULADO se bloqueará el hard-delete confirmado.
  await ajusteRepository.remove(id);
}
