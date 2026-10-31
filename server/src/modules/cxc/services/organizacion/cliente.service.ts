import {
  buildPaginationMeta,
  esNitValido,
  ESTADOS_CLIENTE,
  formatearNit,
  NIT_EJEMPLO,
  normalizarNit,
  createClienteSchema,
  updateClienteSchema,
  type Cliente,
  type ClienteDetalle,
  type PaginatedResponse,
} from '@erp/contracts';
import { AppError, BadRequestError, NotFoundError } from '../../../../shared/errors/AppError';
import * as clienteRepository from '../../repositories/organizacion/cliente.repository';

/** Consulta de clientes con su condición de pago. */
export async function listClientes(query: {
  page?: string;
  limit?: string;
  search?: string;
  estado?: string;
}): Promise<PaginatedResponse<Cliente>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const search = query.search?.trim().slice(0, 100) || undefined;
  const estado = query.estado?.trim().toUpperCase() || undefined;
  if (estado && !(ESTADOS_CLIENTE as readonly string[]).includes(estado)) {
    throw new BadRequestError('El estado del cliente no es válido.');
  }

  const { data, total } = await clienteRepository.findAll({ page, limit, search, estado });
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getCliente(id: number): Promise<Cliente> {
  const cliente = await clienteRepository.findById(id);
  if (!cliente) throw new NotFoundError(`Cliente ${id} no encontrado`);
  return cliente;
}

/** Vista de detalle: datos del cliente + validez del NIT + resumen de cartera. */
export async function getClienteDetalle(id: number): Promise<ClienteDetalle> {
  const cliente = await getCliente(id);
  const resumen = await clienteRepository.findResumen(id);
  return { ...cliente, nitValido: esNitValido(cliente.nit), resumen };
}

const errorNit = () => new AppError(
  `El NIT no es válido: revisa el número y su dígito verificador (ejemplo ${NIT_EJEMPLO}) o usa CF.`,
  400, 'BAD_REQUEST', true, [{ campo: 'nit', mensaje: 'El NIT no es válido: revisa el número y su dígito verificador.' }],
);

/** Alta de cliente: el NIT siempre debe ser válido (no hay dato heredado que conservar). */
export async function createCliente(raw: unknown, idUsuario?: number): Promise<ClienteDetalle> {
  const input = createClienteSchema.parse(raw);
  const nit = normalizarNit(input.nit);
  if (!esNitValido(nit)) throw errorNit();
  const id = await clienteRepository.create({ ...input, nit: nit === 'CF' ? 'CF' : formatearNit(nit) }, idUsuario);
  return getClienteDetalle(id);
}

export async function updateCliente(id: number, raw: unknown, idUsuario?: number): Promise<ClienteDetalle> {
  const input = updateClienteSchema.parse(raw);
  const actual = await getCliente(id);

  // Un NIT nuevo debe ser válido (dígito verificador SAT, sin ser solo ceros). Si no se
  // cambia, se conserva tal cual: hay NIT heredados que no pasan la validación.
  const nitNuevo = normalizarNit(input.nit);
  const nitCambio = nitNuevo !== normalizarNit(actual.nit);
  if (nitCambio && !esNitValido(nitNuevo)) throw errorNit();

  await clienteRepository.update(id, {
    ...input,
    nit: nitCambio ? (nitNuevo === 'CF' ? 'CF' : formatearNit(nitNuevo)) : (actual.nit ?? input.nit),
  }, idUsuario);
  return getClienteDetalle(id);
}
