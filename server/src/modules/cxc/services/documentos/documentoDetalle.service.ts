import {
  createDocumentoDetalleSchema,
  updateDocumentoDetalleSchema,
  type DocumentoDetalle,
} from '@erp/contracts';
import * as documentoDetalleRepository from '../../repositories/documentos/documentoDetalle.repository';
import { NotFoundError, getDocumento } from './documento.service';

export async function listDetalles(idDocumento: number): Promise<DocumentoDetalle[]> {
  await getDocumento(idDocumento);
  return documentoDetalleRepository.findByDocumento(idDocumento);
}

export async function getDetalle(id: number): Promise<DocumentoDetalle> {
  const detalle = await documentoDetalleRepository.findById(id);
  if (!detalle) throw new NotFoundError(`Detalle de documento ${id} no encontrado`);
  return detalle;
}

export async function createDetalle(idDocumento: number, rawInput: unknown): Promise<DocumentoDetalle> {
  await getDocumento(idDocumento);
  const input = createDocumentoDetalleSchema.parse({ ...(rawInput as object), idDocumento });
  const id = await documentoDetalleRepository.create(input);
  return getDetalle(id);
}

export async function updateDetalle(id: number, rawInput: unknown): Promise<DocumentoDetalle> {
  const input = updateDocumentoDetalleSchema.parse(rawInput);
  const actual = await getDetalle(id);

  // TOTAL es un dato derivado. Si cambia cantidad o precio unitario y el
  // cliente no envía un total explícito, lo recalculamos para evitar que
  // CXC_DOCUMENTO_DETALLE quede inconsistente.
  const cantidad = input.cantidad ?? actual.cantidad;
  const precioUnitario = input.precioUnitario ?? actual.precioUnitario;
  const total =
    input.total ??
    (input.cantidad !== undefined || input.precioUnitario !== undefined
      ? Number((cantidad * precioUnitario).toFixed(2))
      : undefined);

  await documentoDetalleRepository.update(id, {
    ...input,
    ...(total !== undefined ? { total } : {}),
  });

  return getDetalle(id);
}

export async function deleteDetalle(id: number): Promise<void> {
  await getDetalle(id);
  await documentoDetalleRepository.remove(id);
}
