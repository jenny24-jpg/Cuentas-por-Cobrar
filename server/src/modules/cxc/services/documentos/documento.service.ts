
import {
  createDocumentoSchema,
  updateDocumentoSchema,
  anularDocumentoSchema,
  buildPaginationMeta,
  type Documento,
  type PaginatedResponse,
} from '@erp/contracts';

import { businessTodayIso } from '../../../../shared/date';
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/errors/AppError';

export { NotFoundError };

import * as documentoRepository from '../../repositories/documentos/documento.repository';
import * as catalogosRepository from '../../repositories/documentos/catalogosDocumentos.repository';
import * as condicionCreditoRepository from '../../repositories/credito/condicionCredito.repository';
import * as clienteRepository from '../../repositories/organizacion/cliente.repository';
import * as tipoDocumentoRepository from '../../repositories/documentos/tipoDocumento.repository';
import * as sharedCatalogosRepository from '../../repositories/catalogos.repository';

import {
  hasFinancialMovement as hasMovement,
  isDocumentoBloqueadoParaAplicacion,
} from '../../shared/financialRules';

const hasFinancialMovement = (documento: Documento) =>
  hasMovement(documento.total, documento.saldo);

/** Suma días a una fecha AAAA-MM-DD sin pasar por zonas horarias. */
function sumarDias(fechaIso: string, dias: number): string {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/**
 * Condición de crédito del documento (la indicada o, si no hay, la del cliente)
 * y su vencimiento: fecha del documento + días de crédito (0 = contado).
 */
async function resolverPlazo(
  idCliente: number,
  idCondicionCredito: number | null | undefined,
  fechaDocumento: string,
): Promise<{ idCondicionCredito: number; fechaVencimiento: string }> {
  let idCondicion = idCondicionCredito ?? null;

  if (!idCondicion) {
    const cliente = await clienteRepository.findById(idCliente);
    idCondicion = cliente?.idCondicion ?? null;
  }

  if (!idCondicion) {
    throw new BadRequestError(
      'El cliente no tiene condición de crédito asignada; asígnala en Clientes o selecciona una para el documento.',
    );
  }

  await assertCondicionCreditoActiva(idCondicion);
  const condicion = await condicionCreditoRepository.findById(idCondicion);

  return {
    idCondicionCredito: idCondicion,
    fechaVencimiento: sumarDias(fechaDocumento, Number(condicion!.diasCredito)),
  };
}

async function assertCondicionCreditoActiva(
  idCondicionCredito: number | null | undefined,
) {
  if (!idCondicionCredito) return;

  const condicion = await condicionCreditoRepository.findById(idCondicionCredito);

  if (!condicion) {
    throw new BadRequestError('La condición de crédito seleccionada no existe');
  }

  if (condicion.estado !== 'A') {
    throw new BadRequestError('La condición de crédito seleccionada está inactiva');
  }
}

// =====================================================
// VALIDACIONES DE FECHAS
// =====================================================

function validarFechaCreacion(fechaDocumento: string): void {
  const fechaActual = businessTodayIso();

  if (fechaDocumento !== fechaActual) {
    throw new BadRequestError(
      'La fecha de creación del documento debe ser la fecha actual de Guatemala.',
    );
  }
}

function validarFechaVencimiento(
  fechaDocumento: string,
  fechaVencimiento: string,
): void {
  if (fechaVencimiento < fechaDocumento) {
    throw new BadRequestError(
      'La fecha de vencimiento no puede ser anterior a la fecha del documento.',
    );
  }
}

// =====================================================
// LISTAR DOCUMENTOS
// =====================================================

export async function listDocumentos(query: {
  page?: string;
  limit?: string;
  search?: string;
}): Promise<PaginatedResponse<Documento>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const { data, total } = await documentoRepository.findAll({
    page,
    limit,
    search: query.search,
  });

  return {
    data,
    meta: buildPaginationMeta(total, page, limit),
  };
}

// =====================================================
// OBTENER DOCUMENTO
// =====================================================

export async function getDocumento(id: number): Promise<Documento> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('ID de documento inválido');
  }

  const documento = await documentoRepository.findById(id);

  if (!documento) {
    throw new NotFoundError(`Documento ${id} no encontrado`);
  }

  return documento;
}

// =====================================================
// CREAR DOCUMENTO
// =====================================================

/** Serie y número que se asignarán al guardar un documento del tipo indicado. */
export async function previewNumeroDocumento(rawIdTipo: unknown): Promise<{ serie: string; numero: string }> {
  const idTipoDocumento = Number(rawIdTipo);
  if (!Number.isInteger(idTipoDocumento) || idTipoDocumento <= 0) {
    throw new BadRequestError('idTipoDocumento debe ser un entero positivo');
  }
  try {
    return await documentoRepository.previewNumero(idTipoDocumento);
  } catch (err) {
    if (err instanceof Error && /no encontrado/.test(err.message)) {
      throw new NotFoundError(`Tipo de documento ${idTipoDocumento} no encontrado`);
    }
    throw err;
  }
}

export async function createDocumento(
  rawInput: unknown,
): Promise<Documento> {
  const parsed = createDocumentoSchema.parse(rawInput);

  if (await tipoDocumentoRepository.esTipoMora(parsed.idTipoDocumento)) {
    throw new BadRequestError('Las notas de débito por mora las emite el sistema automáticamente; no se registran a mano.');
  }

  // La fecha de creación debe ser la fecha actual.
  validarFechaCreacion(parsed.fechaDocumento);

  // Condición: la indicada o la del cliente. El vencimiento es la fecha del
  // documento más los días de crédito; lo calcula el servidor.
  const plazo = await resolverPlazo(
    parsed.idCliente,
    parsed.idCondicionCredito,
    parsed.fechaDocumento,
  );
  const input = { ...parsed, ...plazo };

  // NIT_CLIENTE es una fotografía del dato maestro
  // al momento de crear el documento.
  // El saldo inicia igual al total y el estado en PENDIENTE.
  const nitCliente = await catalogosRepository.findClienteNit(
    input.idCliente,
  );

  const id = await documentoRepository.create({
    ...input,
    nitCliente,
  });

  return getDocumento(id);
}

// =====================================================
// ACTUALIZAR DOCUMENTO
// =====================================================

export async function updateDocumento(
  id: number,
  rawInput: unknown,
): Promise<Documento> {
  const current = await getDocumento(id);
  const input = updateDocumentoSchema.parse(rawInput);

  if (await tipoDocumentoRepository.esTipoMora(current.idTipoDocumento)) {
    throw new ConflictError('Una nota de débito por mora no se edita: la emite el sistema. Si no corresponde cobrarla, anúlala.');
  }

  await assertCondicionCreditoActiva(input.idCondicionCredito);

  if (isDocumentoBloqueadoParaAplicacion(current.estado)) {
    throw new ConflictError(
      'Un documento pagado o anulado no puede editarse desde el CRUD.',
    );
  }

  // Los documentos con movimientos financieros
  // no pueden modificarse directamente.
  if (hasFinancialMovement(current)) {
    throw new ConflictError(
      'El documento ya tiene movimientos financieros. No puede editarse directamente; utiliza reversa, nota de crédito o ajuste autorizado.',
    );
  }

  // La serie y el número salen del tipo de documento: cambiar el tipo dejaría
  // un correlativo de otra serie.
  if (
    input.idTipoDocumento !== undefined &&
    input.idTipoDocumento !== current.idTipoDocumento
  ) {
    throw new BadRequestError(
      'El tipo de documento no puede cambiarse porque define la serie y el número. Elimina o anula el documento y créalo con el tipo correcto.',
    );
  }

  // La fecha original no puede modificarse.
  const fechaOriginal = current.fechaDocumento.slice(0, 10);

  if (
    input.fechaDocumento !== undefined &&
    input.fechaDocumento !== fechaOriginal
  ) {
    throw new BadRequestError(
      'La fecha original del documento no puede modificarse.',
    );
  }

  // El vencimiento siempre sale de la condición de crédito (la indicada o la
  // del cliente): no se escribe a mano.
  const plazo = await resolverPlazo(
    input.idCliente ?? current.idCliente,
    input.idCondicionCredito !== undefined
      ? input.idCondicionCredito
      : current.idCondicionCredito,
    fechaOriginal,
  );

  const finalInput = {
    idCliente: input.idCliente ?? current.idCliente,
    idTipoDocumento:
      input.idTipoDocumento ?? current.idTipoDocumento,
    idMoneda: input.idMoneda ?? current.idMoneda,
    fechaDocumento: fechaOriginal,
    fechaVencimiento: plazo.fechaVencimiento,
    total: input.total ?? current.total,
  };

  // Validaciones del contrato.
  createDocumentoSchema.parse(finalInput);

  // Verifica que la fecha de vencimiento sea válida.
  validarFechaVencimiento(
    finalInput.fechaDocumento,
    finalInput.fechaVencimiento,
  );

  const nextInput: documentoRepository.DocumentoInternalUpdate = {
    ...input,
    idCondicionCredito: plazo.idCondicionCredito,
    fechaVencimiento: plazo.fechaVencimiento,
  };

  // Impide cambiar la fecha original en el repositorio.
  delete nextInput.fechaDocumento;

  if (
    input.idCliente !== undefined &&
    input.idCliente !== current.idCliente
  ) {
    nextInput.nitCliente =
      await catalogosRepository.findClienteNit(input.idCliente);
  }

  // Si cambia el total antes de cualquier movimiento,
  // el saldo debe mantenerse igual al nuevo total.
  if (
    input.total !== undefined &&
    Math.abs(input.total - current.total) > 0.005
  ) {
    nextInput.saldo = input.total;
    nextInput.estado = 'PENDIENTE';
  }

  await documentoRepository.update(id, nextInput);

  return getDocumento(id);
}

// =====================================================
// ELIMINAR DOCUMENTO
// =====================================================

export async function deleteDocumento(id: number): Promise<void> {
  const current = await getDocumento(id);
  const estado = String(current.estado).toUpperCase();

  if (
    hasFinancialMovement(current) ||
    !['PENDIENTE', 'VENCIDO'].includes(estado)
  ) {
    throw new ConflictError(
      'Solo se puede eliminar físicamente un documento sin movimientos y en estado pendiente. Los demás deben anularse mediante el flujo financiero.',
    );
  }

  await documentoRepository.remove(id);
}

// =====================================================
// ANULAR DOCUMENTO
// =====================================================

export async function anularDocumento(
  id: number,
  rawInput: unknown,
): Promise<Documento> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('ID de documento inválido');
  }

  const input = anularDocumentoSchema.parse(rawInput);

  if (
    input.fechaAnulacion &&
    input.fechaAnulacion > businessTodayIso()
  ) {
    throw new BadRequestError(
      'La fecha de anulación no puede ser futura',
    );
  }

  if (
    !(await sharedCatalogosRepository.empleadoExiste(
      input.idEmpleadoAnulacion,
    ))
  ) {
    throw new BadRequestError(
      'El empleado seleccionado no existe',
    );
  }

  // La anulación perdona el saldo restante.
  // Los movimientos históricos mantienen su validez.
  await documentoRepository.anular(id, input);

  return getDocumento(id);
}
