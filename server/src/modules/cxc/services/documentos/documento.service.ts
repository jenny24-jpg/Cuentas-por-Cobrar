import {
  createDocumentoSchema,
  updateDocumentoSchema,
  buildPaginationMeta,
  type Documento,
  type PaginatedResponse,
} from '@erp/contracts';
import * as documentoRepository from '../../repositories/documentos/documento.repository';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

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
  const id = await documentoRepository.create(input);
  return getDocumento(id);
}

export async function updateDocumento(id: number, rawInput: unknown): Promise<Documento> {
  const input = updateDocumentoSchema.parse(rawInput);
  await getDocumento(id);
  await documentoRepository.update(id, input);
  return getDocumento(id);
}

export async function deleteDocumento(id: number): Promise<void> {
  await getDocumento(id);
  await documentoRepository.remove(id);
}
