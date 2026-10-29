
import {
  createRutaSchema,
  updateRutaSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type Ruta,
  type RutasPorEmpleado,
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

// =====================================================
// VALIDACIONES COMPARTIDAS
// =====================================================

/**
 * Error 400 asociado al campo fecha, para que
 * el formulario lo muestre junto al campo.
 */
const errorFecha = (mensaje: string) =>
  new AppError(
    mensaje,
    400,
    'BAD_REQUEST',
    true,
    [{ campo: 'fecha', mensaje }],
  );

/**
 * La fecha planificada no puede:
 * - Ser anterior al día actual de Guatemala.
 * - Caer en sábado o domingo.
 */
function validarFechaPlanificada(
  fecha: string,
): void {
  if (fecha < businessTodayIso()) {
    throw errorFecha(
      'La fecha planificada no puede ser anterior a hoy.',
    );
  }

  if (!esDiaDeVisita(fecha)) {
    throw errorFecha(mensajeDiaDescanso(fecha));
  }
}

/**
 * Comprueba que el identificador de la ruta
 * sea un número entero positivo.
 */
function validarIdRuta(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(
      'ID de ruta inválido.',
    );
  }
}

// =====================================================
// LISTAR RUTAS
// =====================================================

export async function listRutas(query: {
  page?: string;
  limit?: string;
  search?: string;
  idEmpleado?: string;

  /**
   * YYYY-MM-DD: rutas planificadas ese día.
   * Utilizado para el aviso de rutas simultáneas.
   */
  fecha?: string;

  excluirId?: string;
}): Promise<PaginatedResponse<Ruta>> {
  const page = Math.max(
    1,
    Number(query.page) || 1,
  );

  const limit = Math.min(
    100,
    Math.max(1, Number(query.limit) || 20),
  );

  let idEmpleado: number | undefined;

  if (
    query.idEmpleado !== undefined &&
    query.idEmpleado !== ''
  ) {
    idEmpleado = Number(query.idEmpleado);

    if (
      !Number.isInteger(idEmpleado) ||
      idEmpleado <= 0
    ) {
      throw new BadRequestError(
        'El empleado del filtro no es válido.',
      );
    }
  }

  const fecha =
    query.fecha &&
    /^\d{4}-\d{2}-\d{2}$/.test(query.fecha)
      ? query.fecha
      : undefined;

  const excluirId =
    Number(query.excluirId) > 0
      ? Number(query.excluirId)
      : undefined;

  const { data, total } =
    await rutaRepository.findAll({
      page,
      limit,
      search:
        query.search?.trim() || undefined,
      idEmpleado,
      fecha,
      excluirId,
    });

  return {
    data,
    meta: buildPaginationMeta(
      total,
      page,
      limit,
    ),
  };
}

// =====================================================
// RESUMEN DE RUTAS POR EMPLEADO
// =====================================================

/**
 * Primer nivel de la pantalla de Rutas:
 * agrupa las rutas por cobrador.
 */
export async function listRutasPorEmpleado(
  query: {
    search?: string;
  },
): Promise<RutasPorEmpleado[]> {
  return rutaRepository.resumenPorEmpleado({
    search:
      query.search?.trim().slice(0, 100) ||
      undefined,
  });
}

// =====================================================
// CONSULTAR RUTA POR ID
// =====================================================

export async function getRuta(
  id: number,
): Promise<Ruta> {
  validarIdRuta(id);

  const ruta =
    await rutaRepository.findById(id);

  if (!ruta) {
    throw new NotFoundError(
      `Ruta ${id} no encontrada`,
    );
  }

  return ruta;
}

// =====================================================
// CREAR RUTA
// =====================================================

export async function createRuta(
  rawInput: unknown,
): Promise<Ruta> {
  const input =
    createRutaSchema.parse(rawInput);

  /**
   * REGLA:
   * Toda ruta nueva inicia como PLANIFICADA.
   *
   * No se permite crear una ruta directamente
   * como EN_PROCESO o COMPLETADA.
   */
  if (input.estado !== 'PLANIFICADA') {
    throw new BadRequestError(
      'Una ruta nueva siempre inicia como PLANIFICADA.',
    );
  }

  validarFechaPlanificada(input.fecha);

  const id = await rutaRepository.create(input);

  return getRuta(id);
}

// =====================================================
// ACTUALIZAR DATOS DE LA RUTA
// =====================================================

export async function updateRuta(
  id: number,
  rawInput: unknown,
): Promise<Ruta> {
  validarIdRuta(id);

  const input =
    updateRutaSchema.parse(rawInput);

  /**
   * CORRECCIÓN:
   * El estado de la ruta es administrado
   * exclusivamente por las operaciones.
   *
   * Se impide cambiarlo manualmente desde
   * el formulario o mediante solicitudes
   * directas al endpoint PATCH.
   *
   * PLANIFICADA -> EN_PROCESO:
   * Automático con la primera actividad.
   *
   * EN_PROCESO -> COMPLETADA:
   * Mediante la operación finalizarRuta().
   */

  if (input.estado !== undefined) {
    throw new ConflictError(
      'El estado de la ruta no se modifica manualmente. Se actualiza con las actividades del cobrador o mediante la finalización formal.',
    );
  }

  /**
   * Se conserva la validación original
   * de la fecha planificada.
   *
   * Una ruta histórica puede conservar
   * su fecha original sin ser rechazada.
   */
  if (input.fecha !== undefined) {
    const actual = await getRuta(id);

    const fechaOriginal =
      actual.fecha?.slice(0, 10);

    if (input.fecha !== fechaOriginal) {
      validarFechaPlanificada(input.fecha);
    }
  }

  /**
   * El repositorio conserva sus validaciones
   * transaccionales relacionadas con:
   *
   * - Responsable de la ruta.
   * - Cobros confirmados.
   * - Radio geográfico.
   * - Estados cerrados.
   */
  await rutaRepository.update(id, input);

  return getRuta(id);
}

// =====================================================
// FINALIZAR RUTA
// =====================================================

/**
 * Finaliza formalmente una ruta de cobranza.
 *
 * REGLAS:
 * - La ruta debe estar EN_PROCESO.
 * - Debe existir al menos una parada.
 * - No pueden existir paradas pendientes.
 * - No pueden existir reprogramaciones
 *   que aún requieran seguimiento.
 * - Cada parada debe contar con un resultado
 *   definitivo validado por el repositorio.
 *
 * El cierre:
 * - No genera cobros.
 * - No modifica montos ni saldos.
 * - No genera recibos.
 * - Conserva el historial financiero.
 */
export async function finalizarRuta(
  id: number,
): Promise<Ruta> {
  validarIdRuta(id);

  /**
   * La validación final del estado y
   * las paradas debe realizarse dentro
   * de una única transacción Oracle.
   *
   * El repositorio bloquea la fila con
   * FOR UPDATE para evitar cierres dobles.
   */
  await rutaRepository.finalizar(id);

  // Recuperar la ruta con el nuevo estado.
  return getRuta(id);
}

// =====================================================
// ELIMINAR RUTA
// =====================================================

export async function deleteRuta(
  id: number,
): Promise<void> {
  validarIdRuta(id);

  /**
   * El repositorio impide eliminar rutas
   * cerradas o con paradas asignadas.
   */
  await rutaRepository.remove(id);
}
