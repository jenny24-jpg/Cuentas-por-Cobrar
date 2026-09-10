import {
  createDocumentoSchema,
  updateDocumentoSchema,
  buildPaginationMeta,
  type Documento,
  type PaginatedResponse,
} from '@erp/contracts';
import { NotFoundError } from '../../../../shared/errors/AppError';
export { NotFoundError };
import * as documentoRepository from '../../repositories/documentos/documento.repository';
import * as catalogosRepository from '../../repositories/documentos/catalogosDocumentos.repository';

export async function listDocumentos(query: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<Documento>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const { data, total } = await documentoRepository.findAll({
    page,
    limit,
    search: query.search,
  });

  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getDocumento(id: number): Promise<Documento> {
  const documento = await documentoRepository.findById(id);
  if (!documento) throw new NotFoundError(`Documento ${id} no encontrado`);
  return documento;
}

export async function createDocumento(rawInput: unknown): Promise<Documento> {
  const input = createDocumentoSchema.parse(rawInput);

  // NIT_CLIENTE es una fotografía del dato maestro al momento de crear.
  // Nunca confiamos en un NIT enviado manualmente desde el navegador.
  const nitCliente = await catalogosRepository.findClienteNit(input.idCliente);

  const id = await documentoRepository.create({
    ...input,
    nitCliente,
    saldo: input.total,
  });

  return getDocumento(id);
}

export async function updateDocumento(id: number, rawInput: unknown): Promise<Documento> {
  const current = await getDocumento(id);
  const input = updateDocumentoSchema.parse(rawInput);

  // Validamos el estado final completo, no solo cada campo aislado.
  // Así se detecta saldo > total o vencimiento < fecha aunque solo se
  // haya enviado uno de esos campos en el PATCH.
  createDocumentoSchema.parse({
    idCliente: input.idCliente ?? current.idCliente,
    nitCliente: current.nitCliente,
    idTipoDocumento: input.idTipoDocumento ?? current.idTipoDocumento,
    idMoneda: input.idMoneda ?? current.idMoneda,
    estado: input.estado ?? current.estado,
    serie: input.serie !== undefined ? input.serie : current.serie,
    numeroDocumento: input.numeroDocumento ?? current.numeroDocumento,
    fechaDocumento: input.fechaDocumento ?? current.fechaDocumento.slice(0, 10),
    fechaVencimiento: input.fechaVencimiento ?? current.fechaVencimiento.slice(0, 10),
    total: input.total ?? current.total,
    saldo: input.saldo ?? current.saldo,
  });

  const nextInput = { ...input };
  if (input.idCliente !== undefined && input.idCliente !== current.idCliente) {
    nextInput.nitCliente = await catalogosRepository.findClienteNit(input.idCliente);
  } else {
    // Ignoramos cualquier intento de alterar el NIT directamente.
    delete nextInput.nitCliente;
  }

  await documentoRepository.update(id, nextInput);
  return getDocumento(id);
}

export async function deleteDocumento(id: number): Promise<void> {
  await getDocumento(id);
  await documentoRepository.remove(id);
}
