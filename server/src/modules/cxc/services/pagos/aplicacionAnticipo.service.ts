
import {
  createAplicacionAnticipoSchema,
  reversarAplicacionAnticipoSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type AplicacionAnticipo,
} from '@erp/contracts';

import { businessTodayIso } from '../../../../shared/date';

import * as repository from '../../repositories/pagos/aplicacionAnticipo.repository';
import * as catalogosRepository from '../../repositories/catalogos.repository';

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../../shared/errors/AppError';

// =====================================================
// LISTAR APLICACIONES DE ANTICIPOS
// =====================================================

export async function listAplicacionesAnticipo(q: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<AplicacionAnticipo>> {
  const page = Math.max(1, Number(q.page) || 1);

  const limit = Math.min(
    100,
    Math.max(1, Number(q.limit) || 20),
  );

  const { data, total } = await repository.findAll({
    page,
    limit,
    search: q.search,
  });

  return {
    data,
    meta: buildPaginationMeta(total, page, limit),
  };
}

// =====================================================
// CONSULTAR APLICACIÓN POR ID
// =====================================================

export async function getAplicacionAnticipo(
  id: number,
): Promise<AplicacionAnticipo> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(
      'ID de aplicación inválido',
    );
  }

  const item = await repository.findById(id);

  if (!item) {
    throw new NotFoundError(
      `Aplicación de anticipo ${id} no encontrada`,
    );
  }

  return item;
}

// =====================================================
// CREAR APLICACIÓN DE ANTICIPO
// =====================================================

export async function createAplicacionAnticipo(
  raw: unknown,
): Promise<AplicacionAnticipo> {
  const input = createAplicacionAnticipoSchema.parse(raw);

  // CORRECCIÓN:
  // La fecha de una nueva aplicación debe ser
  // exactamente la fecha actual de Guatemala.
  //
  // No se permiten fechas anteriores ni futuras,
  // incluso mediante solicitudes directas a la API.

  const hoy = businessTodayIso();

  if (input.fechaAplicacion !== hoy) {
    throw new BadRequestError(
      'La fecha de aplicación debe ser la fecha actual del sistema (Guatemala). No se permiten fechas anteriores ni futuras.',
    );
  }

  // Se conserva la validación del empleado
  // responsable de registrar la operación.

  if (
    !(await catalogosRepository.empleadoExiste(
      input.idEmpleado,
    ))
  ) {
    throw new BadRequestError(
      'El empleado seleccionado no existe',
    );
  }

  // El repositorio ejecuta la aplicación
  // dentro de una única transacción Oracle.
  //
  // Se conserva el bloqueo de anticipo y
  // documento para evitar sobreaplicaciones.

  const id = await repository.create({
    ...input,
    fechaAplicacion: hoy,
  });

  return getAplicacionAnticipo(id);
}

// =====================================================
// ACTUALIZAR APLICACIÓN
// =====================================================

export async function updateAplicacionAnticipo(
  _id: number,
  _raw: unknown,
): Promise<AplicacionAnticipo> {
  // Las aplicaciones confirmadas son operaciones
  // financieras que no deben editarse.
  //
  // Para corregir una aplicación se utiliza
  // el procedimiento de reversa.

  throw new ConflictError(
    'Una aplicación confirmada no se edita. Para corregirla, reversa la aplicación y regístrala de nuevo.',
  );
}

// =====================================================
// ELIMINAR APLICACIÓN
// =====================================================

export async function deleteAplicacionAnticipo(
  _id: number,
): Promise<void> {
  // No se eliminan aplicaciones confirmadas.
  // Se conserva el historial financiero.

  throw new ConflictError(
    'Una aplicación confirmada no se elimina físicamente. Debe reversarse para conservar trazabilidad.',
  );
}

// =====================================================
// REVERSAR APLICACIÓN
// =====================================================

export async function reversarAplicacionAnticipo(
  id: number,
  rawInput: unknown,
): Promise<AplicacionAnticipo> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(
      'ID de aplicación inválido',
    );
  }

  const input =
    reversarAplicacionAnticipoSchema.parse(rawInput);

  // Se conserva la política original:
  // la fecha de reversa no puede ser futura.
  //
  // El bloqueo de fecha automática solicitado
  // corresponde al registro de aplicaciones;
  // no modifica todavía el flujo de reversas.

  if (
    input.fechaReversa &&
    input.fechaReversa > businessTodayIso()
  ) {
    throw new BadRequestError(
      'La fecha de reversa no puede ser futura',
    );
  }

  // Comprobar empleado responsable.

  if (
    !(await catalogosRepository.empleadoExiste(
      input.idEmpleadoReversa,
    ))
  ) {
    throw new BadRequestError(
      'El empleado seleccionado no existe',
    );
  }

  // El repositorio debe comprobar el estado,
  // la fecha original y los saldos, dentro
  // de la misma transacción.

  await repository.reversar(id, input);

  return getAplicacionAnticipo(id);
}
