import {
  createRutaSchema,
  updateRutaSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type Ruta,
  type RutasPorEmpleado,
  type SugerenciaSucursalRuta,
  esDiaDeVisita,
  mensajeDiaDescanso,
} from '@erp/contracts';

import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../../shared/errors/AppError';

import { businessTodayIso } from '../../../../shared/date';
import * as rutaRepository from '../../repositories/organizacion/ruta.repository';
import * as zonaCobroRepository from '../../repositories/organizacion/zonaCobro.repository';

/** Error 400 asociado al campo fecha, para presentarlo en el formulario. */
const errorFecha = (mensaje: string) =>
  new AppError(mensaje, 400, 'BAD_REQUEST', true, [{ campo: 'fecha', mensaje }]);

/** La fecha planificada no puede ser pasada ni caer en un dia de descanso. */
function validarFechaPlanificada(fecha: string): void {
  if (fecha < businessTodayIso()) {
    throw errorFecha('La fecha planificada no puede ser anterior a hoy.');
  }
  if (!esDiaDeVisita(fecha)) {
    throw errorFecha(mensajeDiaDescanso(fecha));
  }
}

/**
 * La zona debe existir y estar activa; si la zona tiene sucursal asignada,
 * debe ser la misma sucursal de la ruta.
 */
async function validarZona(idZona: number, idSucursal: number | null | undefined): Promise<void> {
  const zona = await zonaCobroRepository.findActiva(idZona);
  if (!zona) {
    throw new AppError('La zona de cobro no existe o está inactiva.', 400, 'BAD_REQUEST', true,
      [{ campo: 'idZona', mensaje: 'Selecciona una zona activa' }]);
  }
  if (zona.idSucursal && idSucursal && zona.idSucursal !== idSucursal) {
    throw new AppError(`La zona ${zona.nombre} la atiende otra sucursal.`, 400, 'BAD_REQUEST', true,
      [{ campo: 'idZona', mensaje: 'La zona pertenece a otra sucursal' }]);
  }
}

function validarIdRuta(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('ID de ruta invalido.');
  }
}

/** Interpreta un filtro opcional de sucursal. */
function parseIdSucursal(valor?: string): number | undefined {
  if (valor === undefined || valor === '') return undefined;
  const idSucursal = Number(valor);
  if (!Number.isInteger(idSucursal) || idSucursal <= 0) {
    throw new BadRequestError('La sucursal del filtro no es valida.');
  }
  return idSucursal;
}

export async function listRutas(query: {
  page?: string;
  limit?: string;
  search?: string;
  idEmpleado?: string;
  idSucursal?: string;
  /** YYYY-MM-DD: rutas planificadas ese dia. */
  fecha?: string;
  excluirId?: string;
}): Promise<PaginatedResponse<Ruta>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  let idEmpleado: number | undefined;
  if (query.idEmpleado !== undefined && query.idEmpleado !== '') {
    idEmpleado = Number(query.idEmpleado);
    if (!Number.isInteger(idEmpleado) || idEmpleado <= 0) {
      throw new BadRequestError('El empleado del filtro no es valido.');
    }
  }

  const idSucursal = parseIdSucursal(query.idSucursal);
  const fecha = query.fecha && /^\d{4}-\d{2}-\d{2}$/.test(query.fecha)
    ? query.fecha
    : undefined;
  const excluirId = Number(query.excluirId) > 0 ? Number(query.excluirId) : undefined;

  const { data, total } = await rutaRepository.findAll({
    page,
    limit,
    search: query.search?.trim() || undefined,
    idEmpleado,
    idSucursal,
    fecha,
    excluirId,
  });

  return { data, meta: buildPaginationMeta(total, page, limit) };
}

/** Resumen de rutas por empleado, filtrable por sucursal. */
export async function listRutasPorEmpleado(query: {
  search?: string;
  idSucursal?: string;
}): Promise<RutasPorEmpleado[]> {
  return rutaRepository.resumenPorEmpleado({
    search: query.search?.trim().slice(0, 100) || undefined,
    idSucursal: parseIdSucursal(query.idSucursal),
  });
}

/** Sucursal mas cercana a la primera parada con ubicacion; no modifica la ruta. */
export async function sugerirSucursal(idRuta: number): Promise<SugerenciaSucursalRuta> {
  await getRuta(idRuta);
  return rutaRepository.sucursalMasCercana(idRuta);
}

export async function getRuta(id: number): Promise<Ruta> {
  validarIdRuta(id);
  const ruta = await rutaRepository.findById(id);
  if (!ruta) throw new NotFoundError(`Ruta ${id} no encontrada`);
  return ruta;
}

export async function createRuta(rawInput: unknown): Promise<Ruta> {
  const input = createRutaSchema.parse(rawInput);

  if (input.estado !== 'PLANIFICADA') {
    throw new BadRequestError('Una ruta nueva siempre inicia como PLANIFICADA.');
  }

  validarFechaPlanificada(input.fecha);
  await rutaRepository.validarSucursalYEmpleado(input.idSucursal, input.idEmpleado);
  await validarZona(input.idZona, input.idSucursal);

  const id = await rutaRepository.create(input);
  return getRuta(id);
}

export async function updateRuta(id: number, rawInput: unknown): Promise<Ruta> {
  validarIdRuta(id);
  const input = updateRutaSchema.parse(rawInput);

  // Los cambios de estado estan reservados para las operaciones de cobranza
  // y la accion de finalizacion, no para el PATCH administrativo.
  if (input.estado !== undefined) {
    throw new ConflictError(
      'El estado de la ruta no se modifica manualmente. Se actualiza con las actividades del cobrador o mediante la finalizacion formal.',
    );
  }

  // Validar que el responsable siga perteneciendo a la sucursal seleccionada.
  if (input.idSucursal !== undefined || input.idEmpleado !== undefined) {
    const actual = await getRuta(id);
    const idSucursal = input.idSucursal ?? actual.idSucursal;
    if (!idSucursal) {
      throw new AppError(
        'Asigna una sucursal a la ruta antes de cambiar su responsable.',
        400,
        'BAD_REQUEST',
        true,
        [{ campo: 'idSucursal', mensaje: 'Selecciona una sucursal' }],
      );
    }
    await rutaRepository.validarSucursalYEmpleado(
      idSucursal,
      input.idEmpleado ?? actual.idEmpleado,
    );
  }

  // Conservar fechas historicas; validar una fecha solo cuando cambia.
  if (input.fecha !== undefined) {
    const actual = await getRuta(id);
    if (input.fecha !== actual.fecha?.slice(0, 10)) {
      validarFechaPlanificada(input.fecha);
    }
  }

  // El repositorio valida bajo bloqueo los cambios de responsable, radio y estado.
  if (input.idZona !== undefined) {
    const actual = await getRuta(id);
    await validarZona(input.idZona, input.idSucursal ?? actual.idSucursal);
  }
  await rutaRepository.update(id, input);
  return getRuta(id);
}

/** Cierre formal; la verificacion de paradas y el cambio de estado son atomicos. */
export async function finalizarRuta(id: number): Promise<Ruta> {
  validarIdRuta(id);
  await rutaRepository.finalizar(id);
  return getRuta(id);
}

export async function cancelarRuta(id: number): Promise<Ruta> {
  validarIdRuta(id);
  await rutaRepository.cancelar(id);
  return getRuta(id);
}

export async function deleteRuta(id: number): Promise<void> {
  validarIdRuta(id);
  await rutaRepository.remove(id);
}
