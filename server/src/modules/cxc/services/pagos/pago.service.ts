
import { businessTodayIso } from '../../../../shared/date';

import {
  createPagoSchema,
  updatePagoSchema,
  anularPagoSchema,
  buildPaginationMeta,
  type PaginatedResponse,
  type Pago,
} from '@erp/contracts';

import * as repository from '../../repositories/pagos/pago.repository';
import * as catalogosRepository from '../../repositories/catalogos.repository';

import {
  BadRequestError,
  NotFoundError,
} from '../../../../shared/errors/AppError';

// =====================================================
// VALIDAR CATÁLOGOS
// =====================================================

async function assertCatalogos(
  idCliente: number,
  idFormaPago: number,
  idMoneda: number,
  idBanco?: number | null,
) {
  const [clienteOk, formas, monedas, bancoOk] =
    await Promise.all([
      catalogosRepository.clienteExiste(idCliente),
      catalogosRepository.listFormasPagoActivas(),
      catalogosRepository.listMonedas(),
      idBanco
        ? catalogosRepository.bancoExiste(idBanco)
        : Promise.resolve(true),
    ]);

  if (!clienteOk) {
    throw new BadRequestError(
      'El cliente seleccionado no existe',
    );
  }

  const forma = formas.find(
    (x) => x.id === idFormaPago,
  );

  if (!forma) {
    throw new BadRequestError(
      'La forma de pago no existe o está inactiva',
    );
  }

  if (!monedas.some((x) => x.id === idMoneda)) {
    throw new BadRequestError(
      'La moneda seleccionada no existe',
    );
  }

  if (idBanco && !bancoOk) {
    throw new BadRequestError(
      'El banco seleccionado no existe o está inactivo',
    );
  }
}

// =====================================================
// LISTAR PAGOS
// =====================================================

export async function listPagos(q: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<Pago>> {
  const page = Math.max(
    1,
    Number(q.page) || 1,
  );

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
    meta: buildPaginationMeta(
      total,
      page,
      limit,
    ),
  };
}

// =====================================================
// CONSULTAR PAGO POR ID
// =====================================================

export async function getPago(
  id: number,
): Promise<Pago> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(
      'ID de pago inválido',
    );
  }

  const item = await repository.findById(id);

  if (!item) {
    throw new NotFoundError(
      `Pago ${id} no encontrado`,
    );
  }

  return item;
}

// =====================================================
// CREAR PAGO
// =====================================================

export async function createPago(
  raw: unknown,
): Promise<Pago> {
  const input = createPagoSchema.parse(raw);

  // REGLA:
  // Todo pago nuevo debe registrarse con la
  // fecha de negocio actual de Guatemala.
  //
  // No se aceptan fechas anteriores ni futuras,
  // aunque alguien envíe una petición directa
  // a la API.

  const hoy = businessTodayIso();

  if (input.fechaPago !== hoy) {
    throw new BadRequestError(
      'La fecha de pago debe ser la fecha actual del sistema (Guatemala). No se permiten fechas anteriores ni futuras.',
    );
  }

  await assertCatalogos(
    input.idCliente,
    input.idFormaPago,
    input.idMoneda,
    input.idBanco,
  );

  // El servidor fija nuevamente la fecha
  // antes de enviarla al repositorio.

  const id = await repository.create({
    ...input,
    fechaPago: hoy,
  });

  return getPago(id);
}

// =====================================================
// ACTUALIZAR PAGO
// =====================================================

export async function updatePago(
  id: number,
  raw: unknown,
): Promise<Pago> {
  const current = await getPago(id);
  const input = updatePagoSchema.parse(raw);

  const fechaOriginal =
    current.fechaPago.slice(0, 10);

  // REGLA:
  // La fecha de un pago existente es inmutable.
  //
  // Si llega una fecha diferente desde cualquier
  // cliente HTTP, se rechaza la modificación.
  //
  // Se permite que la fecha no venga en el PATCH,
  // como hará nuestro formulario corregido.

  if (
    input.fechaPago !== undefined &&
    input.fechaPago !== fechaOriginal
  ) {
    throw new BadRequestError(
      'La fecha de un pago registrado no puede modificarse.',
    );
  }

  const final = {
    idCliente:
      input.idCliente ?? current.idCliente,

    idFormaPago:
      input.idFormaPago ?? current.idFormaPago,

    idMoneda:
      input.idMoneda ?? current.idMoneda,

    idBanco:
      input.idBanco === undefined
        ? current.idBanco
        : input.idBanco,
  };

  await assertCatalogos(
    final.idCliente,
    final.idFormaPago,
    final.idMoneda,
    final.idBanco,
  );

  // Evitamos enviar fechaPago al repositorio.
  // Los demás campos pueden seguir actualizándose
  // si las reglas financieras lo permiten.

  const {
    fechaPago: _fechaNoModificable,
    ...datosActualizables
  } = input;

  // repository.update() conserva el bloqueo
  // FOR UPDATE y sus validaciones de aplicaciones.

  await repository.update(
    id,
    datosActualizables,
  );

  return getPago(id);
}

// =====================================================
// ELIMINAR PAGO
// =====================================================

export async function deletePago(
  id: number,
): Promise<void> {
  await getPago(id);

  // El repositorio bloquea la fila con
  // FOR UPDATE y valida que se pueda eliminar.

  await repository.remove(id);
}

// =====================================================
// ANULAR PAGO
// =====================================================

export async function anularPago(
  id: number,
  rawInput: unknown,
): Promise<Pago> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(
      'ID de pago inválido',
    );
  }

  const input = anularPagoSchema.parse(rawInput);

  // Se conserva la regla existente de anulación:
  // no se permiten fechas futuras.
  //
  // La restricción de fecha automática solicitada
  // se aplica al registro de pagos, no altera
  // todavía el proceso de anulación.

  if (
    input.fechaAnulacion &&
    input.fechaAnulacion > businessTodayIso()
  ) {
    throw new BadRequestError(
      'La fecha de anulación no puede ser futura',
    );
  }

  if (
    !(await catalogosRepository.empleadoExiste(
      input.idEmpleadoAnulacion,
    ))
  ) {
    throw new BadRequestError(
      'El empleado seleccionado no existe',
    );
  }

  await getPago(id);

  await repository.anular(id, input);

  return getPago(id);
}
