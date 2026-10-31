
import { businessTodayIso } from '../../../../shared/date';

import {
  createAnticipoSchema,
  updateAnticipoSchema,
  anularAnticipoSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type Anticipo,
} from '@erp/contracts';

import * as repository from '../../repositories/pagos/anticipo.repository';
import * as pagoRepository from '../../repositories/pagos/pago.repository';
import * as aplicacionRepository from '../../repositories/pagos/aplicacionAnticipo.repository';
import * as catalogosRepository from '../../repositories/catalogos.repository';

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../../shared/errors/AppError';

// =====================================================
// LISTAR ANTICIPOS
// =====================================================

export async function listAnticipos(q: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<Anticipo>> {
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
// CONSULTAR ANTICIPO POR ID
// =====================================================

export async function getAnticipo(
  id: number,
): Promise<Anticipo> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('ID de anticipo inválido');
  }

  const item = await repository.findById(id);

  if (!item) {
    throw new NotFoundError(
      `Anticipo ${id} no encontrado`,
    );
  }

  return item;
}

// =====================================================
// VALIDAR PAGO RELACIONADO
// =====================================================

async function assertPagoCliente(
  idPago: number | null | undefined,
  idCliente: number,
  fechaAnticipo: string,
): Promise<void> {
  // Se conserva la compatibilidad con el contrato.
  // La validación del respaldo obligatorio también
  // debe mantenerse en el repositorio.

  if (idPago == null) {
    return;
  }

  const pago = await pagoRepository.findById(idPago);

  if (!pago) {
    throw new BadRequestError(
      'El pago relacionado no existe',
    );
  }

  // El pago y el anticipo deben pertenecer
  // al mismo cliente.

  if (pago.idCliente !== idCliente) {
    throw new BadRequestError(
      'El anticipo y el pago relacionado deben pertenecer al mismo cliente',
    );
  }

  // No permitir pagos anulados o reversados.

  const estadoPago = String(
    pago.estado ?? '',
  ).trim().toUpperCase();

  if (
    ['ANULADO', 'REVERSADO'].includes(estadoPago)
  ) {
    throw new ConflictError(
      'No se puede relacionar un anticipo con un pago anulado o reversado.',
    );
  }

  // La fecha del anticipo no puede ser
  // anterior a la fecha del pago.

  const fechaPago = pago.fechaPago.slice(0, 10);

  if (fechaAnticipo < fechaPago) {
    throw new BadRequestError(
      'La fecha del anticipo no puede ser anterior a la fecha del pago relacionado.',
    );
  }
}

// =====================================================
// CREAR ANTICIPO
// =====================================================

export async function createAnticipo(
  raw: unknown,
): Promise<Anticipo> {
  const input = createAnticipoSchema.parse(raw);

  // CORRECCIÓN:
  // Un anticipo nuevo solamente puede registrarse
  // con la fecha actual de Guatemala.
  //
  // Se rechazan fechas anteriores y futuras,
  // incluso si llegan directamente a la API.

  const hoy = businessTodayIso();

  if (input.fecha !== hoy) {
    throw new BadRequestError(
      'La fecha del anticipo debe ser la fecha actual del sistema (Guatemala). No se permiten fechas anteriores ni futuras.',
    );
  }

  // Conservar la validación del pago
  // que respalda el anticipo.

  await assertPagoCliente(
    input.idPago,
    input.idCliente,
    hoy,
  );

  // Se fija la fecha desde el servidor.
  // No se utiliza directamente el valor
  // recibido desde el navegador.

  const id = await repository.create({
    ...input,
    fecha: hoy,
  });

  return getAnticipo(id);
}

// =====================================================
// ACTUALIZAR ANTICIPO
// =====================================================

export async function updateAnticipo(
  id: number,
  raw: unknown,
): Promise<Anticipo> {
  const current = await getAnticipo(id);

  // Únicamente los anticipos disponibles
  // pueden editarse directamente.

  const estadoActual = String(
    current.estado ?? '',
  ).trim().toUpperCase();

  if (estadoActual !== 'DISPONIBLE') {
    throw new ConflictError(
      'Solo los anticipos disponibles pueden modificarse directamente.',
    );
  }

  // Conservar la protección de
  // aplicaciones confirmadas.

  const aplicado =
    await aplicacionRepository.sumAplicadoPorAnticipo(id);

  if (aplicado > 0.005) {
    throw new ConflictError(
      'El anticipo ya tiene aplicaciones y no puede editarse directamente. Primero debe reversarse la aplicación.',
    );
  }

  const input = updateAnticipoSchema.parse(raw);

  // CORRECCIÓN:
  // La fecha de un anticipo existente
  // no puede modificarse.
  //
  // Se permite omitir la fecha durante
  // la edición, como hará el formulario.
  //
  // Si viene informada, debe coincidir
  // exactamente con la fecha original.

  const fechaOriginal =
    current.fecha.slice(0, 10);

  if (
    input.fecha !== undefined &&
    input.fecha !== fechaOriginal
  ) {
    throw new BadRequestError(
      'La fecha de un anticipo registrado no puede modificarse.',
    );
  }

  // Calcular los valores finales para
  // validar el pago relacionado.

  const finalIdPago =
    input.idPago === undefined
      ? current.idPago
      : input.idPago;

  const finalIdCliente =
    input.idCliente ?? current.idCliente;

  // Mantener la fecha original, incluso
  // cuando el anticipo fue creado antes
  // de implementar la fecha automática.

  await assertPagoCliente(
    finalIdPago,
    finalIdCliente,
    fechaOriginal,
  );

  // CORRECCIÓN:
  // Excluir fecha del PATCH enviado al
  // repositorio para evitar alterar Oracle.

  const {
    fecha: _fechaNoModificable,
    ...datosActualizables
  } = input;

  await repository.update(
    id,
    datosActualizables,
  );

  return getAnticipo(id);
}

// =====================================================
// ELIMINAR ANTICIPO
// =====================================================

export async function deleteAnticipo(
  id: number,
): Promise<void> {
  const current = await getAnticipo(id);

  const aplicado =
    await aplicacionRepository.sumAplicadoPorAnticipo(id);

  if (aplicado > 0.005) {
    throw new ConflictError(
      'Un anticipo aplicado no se elimina. Debe reversarse/anularse para conservar trazabilidad.',
    );
  }

  const estadoActual = String(
    current.estado ?? '',
  ).trim().toUpperCase();

  if (estadoActual !== 'DISPONIBLE') {
    throw new ConflictError(
      'Solo un anticipo disponible y sin aplicaciones puede eliminarse físicamente.',
    );
  }

  // El repositorio conserva sus
  // validaciones y restricciones financieras.

  await repository.remove(id);
}

// =====================================================
// ANULAR ANTICIPO
// =====================================================

export async function anularAnticipo(
  id: number,
  rawInput: unknown,
): Promise<Anticipo> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(
      'ID de anticipo inválido',
    );
  }

  const input = anularAnticipoSchema.parse(rawInput);

  // Se mantiene la política original
  // de anulación: no permitir fechas futuras.
  //
  // La fecha fija solicitada afecta
  // el registro de anticipos, no el
  // procedimiento de anulación.

  if (
    input.fechaAnulacion &&
    input.fechaAnulacion > businessTodayIso()
  ) {
    throw new BadRequestError(
      'La fecha de anulación no puede ser futura',
    );
  }

  // Verificar que el empleado exista.

  if (
    !(await catalogosRepository.empleadoExiste(
      input.idEmpleadoAnulacion,
    ))
  ) {
    throw new BadRequestError(
      'El empleado seleccionado no existe',
    );
  }

  await getAnticipo(id);

  // El repositorio debe proteger el estado
  // y las aplicaciones durante la transacción.

  await repository.anular(id, input);

  return getAnticipo(id);
}
