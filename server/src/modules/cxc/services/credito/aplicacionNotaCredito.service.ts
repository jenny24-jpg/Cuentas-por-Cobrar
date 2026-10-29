
import { businessTodayIso } from '../../../../shared/date';

import {
  createAplicacionNotaCreditoSchema,
  reversarAplicacionNotaCreditoSchema,
  type AplicacionNotaCredito,
} from '@erp/contracts';

import * as repository from '../../repositories/credito/aplicacionNotaCredito.repository';
import * as catalogosRepository from '../../repositories/catalogos.repository';

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../../shared/errors/AppError';

// =====================================================
// LISTAR APLICACIONES DE NOTAS DE CRÉDITO
// =====================================================

export async function list(params: {
  page: number;
  limit: number;
  search?: string;
}) {
  return repository.findAll({
    ...params,
    page: Math.max(1, params.page),
    limit: Math.min(
      100,
      Math.max(1, params.limit),
    ),
  });
}

// =====================================================
// CONSULTAR APLICACIÓN POR ID
// =====================================================

export async function getOne(
  id: number,
): Promise<AplicacionNotaCredito> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(
      'ID de aplicación inválido',
    );
  }

  const aplicacion = await repository.findById(id);

  if (!aplicacion) {
    throw new NotFoundError(
      `Aplicación de nota de crédito ${id} no encontrada`,
    );
  }

  return aplicacion;
}

// =====================================================
// CREAR APLICACIÓN DE NOTA DE CRÉDITO
// =====================================================

export async function create(
  rawInput: unknown,
): Promise<AplicacionNotaCredito> {
  const input =
    createAplicacionNotaCreditoSchema.parse(rawInput);

  // CORRECCIÓN:
  // Toda aplicación nueva debe utilizar
  // la fecha actual de Guatemala.
  //
  // Se rechazan fechas anteriores y futuras,
  // incluso si se envían directamente a la API.

  const hoy = businessTodayIso();

  if (input.fechaAplicacion !== hoy) {
    throw new BadRequestError(
      'La fecha de aplicación debe ser la fecha actual del sistema (Guatemala). No se permiten fechas anteriores ni futuras.',
    );
  }

  // Conservar la validación del empleado
  // responsable de la operación.

  if (
    !(await catalogosRepository.empleadoExiste(
      input.idEmpleado,
    ))
  ) {
    throw new BadRequestError(
      'El empleado seleccionado no existe',
    );
  }

  // Se utiliza la fecha calculada
  // por el servidor.
  //
  // El repositorio conserva sus propias
  // validaciones y transacciones financieras.

  const id = await repository.create({
    ...input,
    fechaAplicacion: hoy,
  });

  return getOne(id);
}

// =====================================================
// ACTUALIZAR APLICACIÓN
// =====================================================

export async function update(
  _id: number,
  _rawInput: unknown,
) {
  // Las aplicaciones confirmadas son
  // movimientos financieros inmutables.
  //
  // Para corregir una aplicación se utiliza
  // el procedimiento de reversa.

  throw new ConflictError(
    'Una aplicación de nota de crédito confirmada no se edita. Para corregirla, reversa la aplicación y regístrala de nuevo.',
  );
}

// =====================================================
// ELIMINAR APLICACIÓN
// =====================================================

export async function remove(
  _id: number,
) {
  // Conservar el historial financiero.

  throw new ConflictError(
    'Una aplicación de nota de crédito confirmada no se elimina físicamente. Debe reversarse para conservar trazabilidad.',
  );
}

// =====================================================
// REVERSAR APLICACIÓN
// =====================================================

export async function reversar(
  id: number,
  rawInput: unknown,
): Promise<AplicacionNotaCredito> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(
      'ID de aplicación inválido',
    );
  }

  const input =
    reversarAplicacionNotaCreditoSchema.parse(
      rawInput,
    );

  // Se conserva la regla existente:
  // la fecha de reversa no puede ser futura.
  //
  // El bloqueo de fecha actual solicitado
  // corresponde a nuevas aplicaciones,
  // no al procedimiento de reversa.

  if (
    input.fechaReversa &&
    input.fechaReversa > businessTodayIso()
  ) {
    throw new BadRequestError(
      'La fecha de reversa no puede ser futura',
    );
  }

  // Validar empleado responsable.

  if (
    !(await catalogosRepository.empleadoExiste(
      input.idEmpleadoReversa,
    ))
  ) {
    throw new BadRequestError(
      'El empleado seleccionado no existe',
    );
  }

  // El repositorio se encarga de validar
  // el estado y actualizar los saldos
  // dentro de una transacción Oracle.

  await repository.reversar(id, input);

  return getOne(id);
}
