import type { RutaDetalle } from '@erp/contracts';
import { ConflictError, NotFoundError } from '../../../../shared/errors/AppError';
import * as rutaDetalleRepository from '../../repositories/organizacion/rutaDetalle.repository';
import * as rutaRepository from '../../repositories/organizacion/ruta.repository';

export async function listDetalleByRuta(idRuta: number): Promise<RutaDetalle[]> {
  const ruta = await rutaRepository.findById(idRuta);
  if (!ruta) {
    throw new NotFoundError(`Ruta ${idRuta} no encontrada`);
  }
  return rutaDetalleRepository.findByRuta(idRuta);
}

export async function getDetalle(id: number): Promise<RutaDetalle> {
  const detalle = await rutaDetalleRepository.findById(id);
  if (!detalle) {
    throw new NotFoundError(`Parada de ruta ${id} no encontrada`);
  }
  return detalle;
}

const FLUJO_UNICO = 'Las paradas se agregan con «Asignar documento» (documento, dirección confirmada, hora programada y ubicación en el mapa). Las paradas del formato anterior solo pueden consultarse o eliminarse.';

/** Formato anterior (paradas sin documento ni ubicación): ya no se crean. */
export async function createDetalle(_idRuta: number, _rawInput: unknown): Promise<RutaDetalle> {
  throw new ConflictError(FLUJO_UNICO);
}

/** Formato anterior: ya no se edita; se elimina y se vuelve a asignar con el flujo único. */
export async function updateDetalle(_id: number, _rawInput: unknown): Promise<RutaDetalle> {
  throw new ConflictError(FLUJO_UNICO);
}

export async function deleteDetalle(id: number): Promise<void> {
  await rutaDetalleRepository.remove(id);
}
