
import { businessTodayIso } from '../../../../shared/date';

import {
  createNotaCreditoSchema,
  updateNotaCreditoSchema,
  anularNotaCreditoSchema,
  rechazarNotaCreditoSchema,
  type NotaCredito,
} from '@erp/contracts';

import * as repository from '../../repositories/credito/notaCredito.repository';
import * as aplicacionRepository from '../../repositories/credito/aplicacionNotaCredito.repository';
import * as documentoRepository from '../../repositories/documentos/documento.repository';
import * as catalogosRepository from '../../repositories/catalogos.repository';

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../../shared/errors/AppError';

import {
  isDocumentoBloqueadoParaAplicacion,
} from '../../shared/financialRules';

// =====================================================
// VALIDAR DOCUMENTO DE REFERENCIA
// =====================================================

async function assertDocumentoReferencia(
  idCliente: number,
  idDocumento: number | null | undefined,
  monto: number,
): Promise<void> {
  // Se conserva el comportamiento original.
  // La obligatoriedad del documento también
  // depende del esquema de validación.

  if (!idDocumento) {
    return;
  }

  const documento =
    await documentoRepository.findById(idDocumento);

  if (!documento) {
    throw new BadRequestError(
      'El documento de referencia no existe',
    );
  }

  if (documento.idCliente !== idCliente) {
    throw new BadRequestError(
      'El documento de referencia debe pertenecer al cliente seleccionado',
    );
  }

  if (documento.saldo <= 0) {
    throw new BadRequestError(
      'El documento de referencia ya no tiene saldo pendiente',
    );
  }

  if (monto > documento.saldo) {
    throw new BadRequestError(
      'El monto de la nota no puede superar el saldo del documento de referencia',
    );
  }

  if (
    isDocumentoBloqueadoParaAplicacion(
      documento.estado,
    )
  ) {
    throw new ConflictError(
      'No se puede registrar una nota contra un documento pagado o anulado.',
    );
  }
}

// =====================================================
// LISTAR NOTAS DE CRÉDITO
// =====================================================

export async function list(params: {
  page: number;
  limit: number;
  search?: string;
  pendientesAprobacion?: boolean;
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
// CONSULTAR NOTA DE CRÉDITO POR ID
// =====================================================

export async function getOne(
  id: number,
): Promise<NotaCredito> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(
      'ID de nota de crédito inválido',
    );
  }

  const nota = await repository.findById(id);

  if (!nota) {
    throw new NotFoundError(
      `Nota de crédito ${id} no encontrada`,
    );
  }

  return nota;
}

// =====================================================
// CREAR NOTA DE CRÉDITO
// =====================================================

export async function create(
  rawInput: unknown,
  idEmpleadoRegistro: number,
): Promise<NotaCredito> {
  const input = createNotaCreditoSchema.parse(rawInput);

  // CORRECCIÓN:
  // La fecha de una nueva nota de crédito
  // debe coincidir exactamente con la fecha
  // actual de Guatemala.
  //
  // Se rechazan fechas anteriores y futuras,
  // incluso si llegan directamente a la API.

  const hoy = businessTodayIso();

  if (input.fecha !== hoy) {
    throw new BadRequestError(
      'La fecha de la nota de crédito debe ser la fecha actual del sistema (Guatemala). No se permiten fechas anteriores ni futuras.',
    );
  }

  // Conservar la validación del documento
  // y del monto correspondiente.

  await assertDocumentoReferencia(
    input.idCliente,
    input.idDocumentoReferencia,
    input.monto,
  );

  // La fecha se fija nuevamente en el servidor
  // para no depender del valor del navegador.

  // Queda PENDIENTE (por aprobar) con quien la registró; un ADMIN distinto la aprueba.
  const id = await repository.create(
    {
      ...input,
      fecha: hoy,
    },
    idEmpleadoRegistro,
  );

  return getOne(id);
}

// =====================================================
// ACTUALIZAR NOTA DE CRÉDITO
// =====================================================

export async function update(
  id: number,
  rawInput: unknown,
): Promise<NotaCredito> {
  const current = await getOne(id);

  const input =
    updateNotaCreditoSchema.parse(rawInput);

  // CORRECCIÓN:
  // La fecha de una nota de crédito existente
  // no puede modificarse.
  //
  // El formulario corregido ya no envía
  // el campo fecha cuando se edita.
  //
  // Si otro cliente HTTP lo envía, solo se
  // acepta si coincide con la fecha original.

  const fechaOriginal =
    current.fecha.slice(0, 10);

  if (
    input.fecha !== undefined &&
    input.fecha !== fechaOriginal
  ) {
    throw new BadRequestError(
      'La fecha de una nota de crédito registrada no puede modificarse.',
    );
  }

  // Mantener validaciones sobre los documentos
  // cuando se modifica el cliente, la referencia
  // o el monto de una nota.

  if (
    input.idCliente !== undefined ||
    input.idDocumentoReferencia !== undefined ||
    input.monto !== undefined
  ) {
    await assertDocumentoReferencia(
      input.idCliente ?? current.idCliente,

      input.idDocumentoReferencia === undefined
        ? current.idDocumentoReferencia
        : input.idDocumentoReferencia,

      input.monto ?? current.monto,
    );
  }

  // CORRECCIÓN:
  // Excluimos fecha del objeto que recibe el
  // repositorio para conservarla en Oracle.

  const {
    fecha: _fechaNoModificable,
    ...datosActualizables
  } = input;

  // El repositorio conserva el bloqueo
  // FOR UPDATE y comprueba que no existan
  // aplicaciones confirmadas.

  await repository.update(
    id,
    datosActualizables,
  );

  return getOne(id);
}

// =====================================================
// ELIMINAR NOTA DE CRÉDITO
// =====================================================

/**
 * Las notas de crédito no se borran: se anulan o se rechazan, para que quede
 * quién, cuándo y por qué (y no queden huecos en la numeración).
 */
export async function remove(
  id: number,
): Promise<void> {
  await getOne(id);

  throw new ConflictError(
    'Las notas de crédito no se eliminan; anúlala o recházala para conservar el registro.',
  );
}

// =====================================================
// ANULAR NOTA DE CRÉDITO
// =====================================================

export async function anular(
  id: number,
  rawInput: unknown,
  rol?: string,
): Promise<NotaCredito> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(
      'ID de nota de crédito inválido',
    );
  }

  const input =
    anularNotaCreditoSchema.parse(rawInput);

  // Solo quien registró la nota o un administrador puede anularla.
  const nota = await getOne(id);

  if (
    rol !== 'ADMIN' &&
    nota.idEmpleadoRegistro !== input.idEmpleadoAnulacion
  ) {
    throw new ForbiddenError(
      'Solo quien registró la nota de crédito o un administrador puede anularla.',
    );
  }

  // Se conserva la política original:
  // la fecha de anulación no puede ser futura.
  //
  // La fecha automática solicitada aplica
  // al registro de notas de crédito, no al
  // procedimiento de anulación.

  if (
    input.fechaAnulacion &&
    input.fechaAnulacion > businessTodayIso()
  ) {
    throw new BadRequestError(
      'La fecha de anulación no puede ser futura',
    );
  }

  // Verificar que el empleado responsable exista.

  if (
    !(await catalogosRepository.empleadoExiste(
      input.idEmpleadoAnulacion,
    ))
  ) {
    throw new BadRequestError(
      'El empleado seleccionado no existe',
    );
  }

  // El repositorio comprueba el estado,
  // las aplicaciones y las reglas financieras.

  await repository.anular(id, input);

  return getOne(id);
}

/** Serie y número que se asignarán a la próxima nota de crédito. */
export async function previewNumero(): Promise<{ serie: string; numero: string }> {
  return repository.previewNumero();
}

// =====================================================
// APROBACIÓN DE NOTAS DE CRÉDITO (SOLO ADMIN)
// =====================================================

/** Una nota está por aprobar si sigue pendiente y nadie la ha aprobado. */
function assertPorAprobar(nota: NotaCredito) {
  const estado = String(nota.estado ?? '').trim().toUpperCase();
  if (nota.idEmpleadoAprobacion || !['PENDIENTE', 'ACTIVA'].includes(estado)) {
    throw new ConflictError('La nota de crédito ya no está por aprobar.');
  }
}

/**
 * Aprueba la nota y la aplica a su documento de referencia en la misma
 * transacción. Solo un ADMIN distinto de quien la registró.
 */
export async function aprobar(
  id: number,
  idEmpleadoAprobacion: number,
): Promise<NotaCredito> {
  const nota = await getOne(id);
  assertPorAprobar(nota);

  if (nota.idEmpleadoRegistro === idEmpleadoAprobacion) {
    throw new ConflictError(
      'Quien registró la nota de crédito no puede aprobarla; debe hacerlo otro administrador.',
    );
  }

  await aplicacionRepository.aprobar(id, idEmpleadoAprobacion);

  return getOne(id);
}

/** Rechaza la nota por aprobar: queda ANULADA con el motivo y sin tocar saldos. */
export async function rechazar(
  id: number,
  rawInput: unknown,
  idEmpleado: number,
): Promise<NotaCredito> {
  const input = rechazarNotaCreditoSchema.parse(rawInput);
  const nota = await getOne(id);
  assertPorAprobar(nota);

  await repository.anular(id, {
    idEmpleadoAnulacion: idEmpleado,
    motivoAnulacion: `Rechazada: ${input.motivoRechazo}`,
  });

  return getOne(id);
}
