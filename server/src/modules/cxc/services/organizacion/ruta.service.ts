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
import { AppError, BadRequestError, NotFoundError } from '../../../../shared/errors/AppError';
import { businessTodayIso } from '../../../../shared/date';

/** Error 400 asociado al campo fecha, para que el formulario lo muestre junto al campo. */
const errorFecha = (mensaje: string) => new AppError(mensaje, 400, 'BAD_REQUEST', true, [{ campo: 'fecha', mensaje }]);

/** La fecha planificada no puede ser pasada ni caer en día de descanso del cobrador (sábado o domingo). */
function validarFechaPlanificada(fecha: string) {
  if (fecha < businessTodayIso()) throw errorFecha('La fecha planificada no puede ser anterior a hoy.');
  if (!esDiaDeVisita(fecha)) throw errorFecha(mensajeDiaDescanso(fecha));
}
import * as rutaRepository from '../../repositories/organizacion/ruta.repository';

function parseIdSucursal(valor?: string): number | undefined {
  if (valor === undefined || valor === '') return undefined;
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestError('La sucursal del filtro no es válida.');
  return n;
}

export async function listRutas(query: {
  page?: string;
  limit?: string;
  search?: string;
  idEmpleado?: string;
  idSucursal?: string;
  /** YYYY-MM-DD: rutas planificadas ese día (aviso de rutas simultáneas del mismo cobrador). */
  fecha?: string;
  excluirId?: string;
}): Promise<PaginatedResponse<Ruta>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  let idEmpleado: number | undefined;
  if (query.idEmpleado !== undefined && query.idEmpleado !== '') {
    idEmpleado = Number(query.idEmpleado);
    if (!Number.isInteger(idEmpleado) || idEmpleado <= 0) throw new BadRequestError('El empleado del filtro no es válido.');
  }

  const idSucursal = parseIdSucursal(query.idSucursal);
  const fecha = query.fecha && /^\d{4}-\d{2}-\d{2}$/.test(query.fecha) ? query.fecha : undefined;
  const excluirId = Number(query.excluirId) > 0 ? Number(query.excluirId) : undefined;
  const { data, total } = await rutaRepository.findAll({ page, limit, search: query.search?.trim() || undefined, idEmpleado, idSucursal, fecha, excluirId });

  return { data, meta: buildPaginationMeta(total, page, limit) };
}

/** Primer nivel de la pantalla de Rutas: un resumen por empleado. */
export async function listRutasPorEmpleado(query: { search?: string; idSucursal?: string }): Promise<RutasPorEmpleado[]> {
  return rutaRepository.resumenPorEmpleado({ search: query.search?.trim().slice(0, 100) || undefined, idSucursal: parseIdSucursal(query.idSucursal) });
}

/** Sucursal más cercana a la primera parada con ubicación (solo sugerencia). */
export async function sugerirSucursal(idRuta: number): Promise<SugerenciaSucursalRuta> {
  await getRuta(idRuta);
  return rutaRepository.sucursalMasCercana(idRuta);
}

export async function getRuta(id: number): Promise<Ruta> {
  const ruta = await rutaRepository.findById(id);
  if (!ruta) {
    throw new NotFoundError(`Ruta ${id} no encontrada`);
  }
  return ruta;
}

export async function createRuta(rawInput: unknown): Promise<Ruta> {
  const input = createRutaSchema.parse(rawInput);
  // Toda ruta nace PLANIFICADA; el estado avanza con la operación (visitas, cobros) o al cerrarla.
  if (input.estado !== 'PLANIFICADA') throw new BadRequestError('Una ruta nueva siempre inicia como PLANIFICADA.');
  validarFechaPlanificada(input.fecha);
  await rutaRepository.validarSucursalYEmpleado(input.idSucursal, input.idEmpleado);
  const id = await rutaRepository.create(input);
  return getRuta(id);
}

export async function updateRuta(id: number, rawInput: unknown): Promise<Ruta> {
  const input = updateRutaSchema.parse(rawInput);
  if (input.idSucursal !== undefined || input.idEmpleado !== undefined) {
    const actual = await getRuta(id);
    const idSucursal = input.idSucursal ?? actual.idSucursal;
    if (!idSucursal) {
      throw new AppError('Asigna una sucursal a la ruta antes de cambiar su responsable.', 400, 'BAD_REQUEST', true, [{ campo: 'idSucursal', mensaje: 'Selecciona una sucursal' }]);
    }
    await rutaRepository.validarSucursalYEmpleado(idSucursal, input.idEmpleado ?? actual.idEmpleado);
  }
  if (input.fecha !== undefined) {
    const actual = await getRuta(id);
    // Solo se valida si la fecha cambia: una ruta en curso conserva su fecha original.
    if (input.fecha !== actual.fecha?.slice(0, 10)) validarFechaPlanificada(input.fecha);
  }
  // El repositorio valida estado, responsable y radio bajo bloqueo de la ruta.
  await rutaRepository.update(id, input);
  return getRuta(id);
}

export async function deleteRuta(id: number): Promise<void> {
  await rutaRepository.remove(id);
}
