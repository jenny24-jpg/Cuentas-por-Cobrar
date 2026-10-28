import {
  createTipoDocumentoSchema,
  updateTipoDocumentoSchema,
  buildPaginationMeta,
  type TipoDocumento,
  type PaginatedResponse,
} from '@erp/contracts';
import * as tipoDocumentoRepository from '../../repositories/documentos/tipoDocumento.repository';
import { NotFoundError } from './documento.service';
import { ConflictError } from '../../../../shared/errors/AppError';

export async function listTiposDocumento(query: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<TipoDocumento>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const { data, total } = await tipoDocumentoRepository.findAll({ page, limit, search: query.search });
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getTipoDocumento(id: number): Promise<TipoDocumento> {
  const tipo = await tipoDocumentoRepository.findById(id);
  if (!tipo) throw new NotFoundError(`Tipo de documento ${id} no encontrado`);
  return tipo;
}

async function assertSinDuplicados(codigo: string | undefined, nombre: string | undefined, excluirId: number | null) {
  const duplicado = await tipoDocumentoRepository.findDuplicado(codigo, nombre, excluirId);
  if (!duplicado) return;
  if (codigo && duplicado.CODIGO.trim().toUpperCase() === codigo) {
    throw new ConflictError(`El código ${codigo} ya está registrado.`);
  }
  throw new ConflictError(`Ya existe un tipo de documento llamado "${duplicado.NOMBRE}" (código ${duplicado.CODIGO}).`);
}

export async function createTipoDocumento(rawInput: unknown): Promise<TipoDocumento> {
  const input = createTipoDocumentoSchema.parse(rawInput);
  await assertSinDuplicados(input.codigo, input.nombre, null);
  const id = await tipoDocumentoRepository.create(input);
  return getTipoDocumento(id);
}

export async function updateTipoDocumento(id: number, rawInput: unknown): Promise<TipoDocumento> {
  const actual = await getTipoDocumento(id);
  const input = updateTipoDocumentoSchema.parse(rawInput);
  const cambiaCodigo = input.codigo !== undefined && input.codigo !== actual.codigo.trim();
  // El código es la serie de los documentos ya emitidos: cambiarlo rompería su numeración.
  if (cambiaCodigo && (await tipoDocumentoRepository.countDocumentos(id)) > 0) {
    throw new ConflictError('El código no puede cambiarse porque ya hay documentos emitidos con esta serie. Inactiva el tipo y crea uno nuevo.');
  }
  // Solo se revisa lo que cambia: así se puede inactivar un duplicado heredado sin renombrarlo.
  const cambiaNombre = input.nombre !== undefined && input.nombre !== actual.nombre.trim();
  await assertSinDuplicados(cambiaCodigo ? input.codigo : undefined, cambiaNombre ? input.nombre : undefined, id);
  await tipoDocumentoRepository.update(id, input);
  return getTipoDocumento(id);
}

export async function deleteTipoDocumento(id: number): Promise<void> {
  await getTipoDocumento(id);
  const documentos = await tipoDocumentoRepository.countDocumentos(id);
  if (documentos > 0) {
    throw new ConflictError(`No se puede eliminar: hay ${documentos} documento(s) con este tipo. Puedes marcarlo como Inactivo para que ya no se use.`);
  }
  await tipoDocumentoRepository.remove(id);
}
