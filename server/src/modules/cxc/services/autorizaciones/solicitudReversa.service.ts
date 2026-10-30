import {
  buildPaginationMeta,
  crearSolicitudReversaSchema,
  ESTADOS_SOLICITUD_REVERSA,
  rechazarSolicitudReversaSchema,
  TIPOS_SOLICITUD_REVERSA,
  type EstadoSolicitudReversa,
  type PaginatedResponse,
  type SolicitudReversa,
  type TipoSolicitudReversa,
} from '@erp/contracts';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../../shared/errors/AppError';
import * as repo from '../../repositories/autorizaciones/solicitudReversa.repository';
import * as aplicacionPagoService from '../pagos/aplicacionPago.service';
import * as aplicacionAnticipoService from '../pagos/aplicacionAnticipo.service';
import * as pagoService from '../pagos/pago.service';
import * as anticipoService from '../pagos/anticipo.service';
import * as aplicacionNotaCreditoService from '../credito/aplicacionNotaCredito.service';
import * as notaCreditoService from '../credito/notaCredito.service';
import * as documentoService from '../documentos/documento.service';
import * as facturaService from '../facturacion/factura.service';

/** Quién hace la petición (lo pone el controlador desde la sesión). */
export interface UsuarioActual {
  idUsuario: number;
  rol: string | undefined;
}

/** Texto de lo que ya no admite la operación, por tipo. */
const YA_CERRADO: Record<TipoSolicitudReversa, string> = {
  REVERSA_APLICACION_PAGO: 'Esta aplicación de pago ya fue reversada.',
  REVERSA_APLICACION_ANTICIPO: 'Esta aplicación de anticipo ya fue reversada.',
  REVERSA_APLICACION_NC: 'Esta aplicación de nota de crédito ya fue reversada.',
  ANULACION_PAGO: 'Este pago ya está anulado o reversado.',
  ANULACION_ANTICIPO: 'Este anticipo ya está anulado.',
  ANULACION_NOTA_CREDITO: 'Esta nota de crédito ya está anulada.',
  ANULACION_DOCUMENTO: 'Este documento ya está anulado o pagado.',
  ANULACION_FACTURA_FEL: 'Esta factura ya está anulada.',
};

/**
 * Ejecuta la reversa o anulación aprobada con las reglas que ya tiene cada módulo
 * (saldos, bloqueos, historial). Queda como responsable el empleado que la solicitó,
 * con el motivo que escribió; quién la aprobó queda en la solicitud.
 */
async function ejecutar(s: { tipo: TipoSolicitudReversa; idRegistro: number; motivo: string; idEmpleadoSolicita: number }): Promise<void> {
  const reversa = { idEmpleadoReversa: s.idEmpleadoSolicita, motivoReversa: s.motivo };
  const anulacion = { idEmpleadoAnulacion: s.idEmpleadoSolicita, motivoAnulacion: s.motivo };
  switch (s.tipo) {
    case 'REVERSA_APLICACION_PAGO': await aplicacionPagoService.reversarAplicacionPago(s.idRegistro, reversa); return;
    case 'REVERSA_APLICACION_ANTICIPO': await aplicacionAnticipoService.reversarAplicacionAnticipo(s.idRegistro, reversa); return;
    case 'REVERSA_APLICACION_NC': await aplicacionNotaCreditoService.reversar(s.idRegistro, reversa); return;
    case 'ANULACION_PAGO': await pagoService.anularPago(s.idRegistro, anulacion); return;
    case 'ANULACION_ANTICIPO': await anticipoService.anularAnticipo(s.idRegistro, anulacion); return;
    // Ya la autorizó un ADMIN: se ejecuta con ese nivel.
    case 'ANULACION_NOTA_CREDITO': await notaCreditoService.anular(s.idRegistro, anulacion, 'ADMIN'); return;
    case 'ANULACION_DOCUMENTO': await documentoService.anularDocumento(s.idRegistro, anulacion); return;
    case 'ANULACION_FACTURA_FEL': await facturaService.anularFactura(s.idRegistro, anulacion); return;
  }
}

const sinEmpleado = ({ idEmpleadoSolicita: _e, ...publica }: SolicitudReversa & { idEmpleadoSolicita: number }): SolicitudReversa => publica;

export async function list(q: { page?: string; limit?: string; estado?: string; search?: string }): Promise<PaginatedResponse<SolicitudReversa>> {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const estado = q.estado?.trim().toUpperCase() || undefined;
  if (estado && !(ESTADOS_SOLICITUD_REVERSA as readonly string[]).includes(estado)) {
    throw new BadRequestError('El estado de la solicitud no es válido.');
  }
  const { data, total } = await repo.findAll({ page, limit, estado: estado as EstadoSolicitudReversa | undefined, search: q.search?.trim().slice(0, 100) || undefined });
  return { data: data.map(sinEmpleado), meta: buildPaginationMeta(total, page, limit) };
}

export async function getOne(id: number): Promise<SolicitudReversa> {
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('ID de solicitud inválido');
  const s = await repo.findById(id);
  if (!s) throw new NotFoundError(`Solicitud ${id} no encontrada`);
  return sinEmpleado(s);
}

/** Ids de un tipo con solicitud pendiente, para marcar las filas en cada pantalla. */
export async function pendientes(rawTipo: unknown): Promise<number[]> {
  const tipo = String(rawTipo ?? '').toUpperCase();
  if (!(TIPOS_SOLICITUD_REVERSA as readonly string[]).includes(tipo)) throw new BadRequestError('Tipo de solicitud no válido.');
  return repo.pendientesPorTipo(tipo as TipoSolicitudReversa);
}

export async function contarPendientes(): Promise<{ pendientes: number }> {
  return { pendientes: await repo.contarPendientes() };
}

/** Registra la solicitud. No cambia ningún saldo: la operación se ejecuta al aprobarse. */
export async function solicitar(raw: unknown, usuario: UsuarioActual, idEmpleado: number): Promise<SolicitudReversa> {
  if (usuario.rol === 'CONSULTA') throw new ForbiddenError('Tu rol es de solo consulta; no puedes solicitar reversas ni anulaciones.');
  const input = crearSolicitudReversaSchema.parse(raw);
  const objetivo = await repo.leerObjetivo(input.tipo, input.idRegistro);
  if (!objetivo) throw new NotFoundError('El registro que quieres reversar o anular no existe.');
  if (!objetivo.abierto) throw new ConflictError(YA_CERRADO[input.tipo]);
  const id = await repo.create({
    tipo: input.tipo, idRegistro: input.idRegistro, referencia: objetivo.referencia, monto: objetivo.monto,
    motivo: input.motivo, idUsuario: usuario.idUsuario, idEmpleado,
  });
  return getOne(id);
}

/** Toma la solicitud pendiente y comprueba que quien resuelve pueda hacerlo. */
async function paraResolver(id: number, usuario: UsuarioActual) {
  if (usuario.rol !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede aprobar o rechazar solicitudes de reversa y anulación.');
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('ID de solicitud inválido');
  const s = await repo.findById(id);
  if (!s) throw new NotFoundError(`Solicitud ${id} no encontrada`);
  if (s.estado !== 'PENDIENTE') throw new ConflictError('Esta solicitud ya fue resuelta.');
  if (s.idUsuarioSolicita === usuario.idUsuario) {
    throw new ForbiddenError('No puedes resolver tu propia solicitud; debe hacerlo otro administrador.');
  }
  return s;
}

/**
 * Aprueba y ejecuta. Primero marca la solicitud (así dos administradores no la
 * ejecutan dos veces); si la reversa o anulación falla, la solicitud vuelve a
 * PENDIENTE y se informa el motivo (p. ej. el documento ya tiene otros movimientos).
 */
export async function aprobar(id: number, usuario: UsuarioActual): Promise<SolicitudReversa> {
  const s = await paraResolver(id, usuario);
  await repo.resolver(id, { estado: 'APROBADA', idUsuario: usuario.idUsuario });
  try {
    await ejecutar(s);
  } catch (err) {
    await repo.liberar(id);
    throw err;
  }
  return getOne(id);
}

export async function rechazar(id: number, raw: unknown, usuario: UsuarioActual): Promise<SolicitudReversa> {
  const input = rechazarSolicitudReversaSchema.parse(raw);
  await paraResolver(id, usuario);
  await repo.resolver(id, { estado: 'RECHAZADA', idUsuario: usuario.idUsuario, motivoRechazo: input.motivoRechazo });
  return getOne(id);
}

/** Quien la solicitó puede retirarla mientras siga pendiente. */
export async function cancelar(id: number, usuario: UsuarioActual): Promise<SolicitudReversa> {
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('ID de solicitud inválido');
  const s = await repo.findById(id);
  if (!s) throw new NotFoundError(`Solicitud ${id} no encontrada`);
  if (s.idUsuarioSolicita !== usuario.idUsuario) throw new ForbiddenError('Solo quien hizo la solicitud puede cancelarla.');
  if (s.estado !== 'PENDIENTE') throw new ConflictError('Esta solicitud ya fue resuelta.');
  await repo.resolver(id, { estado: 'CANCELADA', idUsuario: usuario.idUsuario });
  return getOne(id);
}
