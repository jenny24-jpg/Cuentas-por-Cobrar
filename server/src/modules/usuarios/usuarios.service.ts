import {
  buildPaginationMeta, crearUsuarioSchema, editarUsuarioSchema, empleadoSchema,
  type BitacoraAcceso, type EmpleadoAdmin, type EmpleadoVinculable, type PaginatedResponse, type UsuarioAdmin, type UsuarioCreado,
} from '@erp/contracts';
import type { ZodError } from 'zod';
import { AppError, BadRequestError, NotFoundError } from '../../shared/errors/AppError';
import * as authRepo from '../auth/auth.repository';
import { olvidarSesiones, type ClientContext } from '../auth/auth.service';
import { generarClaveTemporal, hashPassword } from '../auth/password';
import type { AccessClaims } from '../auth/tokens';
import * as repo from './usuarios.repository';

const aUsuario = (r: repo.UsuarioAdminRow): UsuarioAdmin => ({
  idUsuario: r.ID_USUARIO,
  username: r.USERNAME,
  nombre: r.NOMBRE,
  email: r.EMAIL,
  rol: r.ROL,
  estado: r.ESTADO,
  idEmpleado: r.ID_EMPLEADO,
  nombreEmpleado: r.NOMBRE_EMPLEADO,
  debeCambiarClave: r.DEBE_CAMBIAR_CLAVE === 'S',
  minutosBloqueo: r.MIN_BLOQUEO,
  intentosFallidos: r.INTENTOS_FALLIDOS,
  sesionesActivas: r.SESIONES_ACTIVAS,
  ultimoLogin: r.ULTIMO_LOGIN ? r.ULTIMO_LOGIN.toISOString() : null,
  fechaCreacion: r.FECHA_CREACION.toISOString(),
});

/** Errores de validación por campo: el formulario los muestra en rojo bajo cada input. */
function validacion(err: ZodError): AppError {
  const details = err.issues.map((i) => ({ campo: String(i.path[0] ?? 'general'), mensaje: i.message }));
  return new AppError(details[0]?.mensaje ?? 'Datos inválidos', 400, 'VALIDATION_ERROR', true, details);
}

const campoInvalido = (campo: string, mensaje: string) =>
  new AppError(mensaje, 400, 'VALIDATION_ERROR', true, [{ campo, mensaje }]);

function auditar(actor: AccessClaims, evento: authRepo.EventoAcceso, objetivo: { id: number; username: string }, ctx: ClientContext, detalle?: string) {
  // La bitácora de administración guarda al usuario AFECTADO en ID_USUARIO/USERNAME y quién actuó en DETALLE.
  authRepo.registrarAcceso({
    idUsuario: objetivo.id, username: objetivo.username, evento, ip: ctx.ip, userAgent: ctx.userAgent,
    detalle: `Por ${actor.usr}${detalle ? `: ${detalle}` : ''}`,
  }).catch(() => undefined);
}

const paginar = (page: unknown, limit: unknown) => {
  const l = Math.min(100, Math.max(1, Number(limit) || 10));
  const p = Math.max(1, Number(page) || 1);
  return { page: p, limit: l, offset: (p - 1) * l };
};

async function existente(id: number): Promise<repo.UsuarioAdminRow> {
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Identificador de usuario no válido.');
  const u = await repo.obtenerUsuarioAdmin(id);
  if (!u) throw new NotFoundError('El usuario no existe.');
  return u;
}

/** Un empleado debe existir, estar activo y no estar vinculado a otro usuario: así "quién lo hizo" nunca es ambiguo. */
async function validarEmpleado(idEmpleado: number | null | undefined, idUsuario: number): Promise<void> {
  if (!idEmpleado) return;
  const e = await repo.obtenerEmpleadoParaVinculo(idEmpleado, idUsuario);
  if (!e) throw campoInvalido('idEmpleado', 'El empleado seleccionado no existe.');
  if (!e.activo) throw campoInvalido('idEmpleado', 'El empleado seleccionado está inactivo.');
  if (e.asignadoA) throw campoInvalido('idEmpleado', `Ese empleado ya está vinculado al usuario "${e.asignadoA}". Cada empleado solo puede tener un usuario.`);
}

export async function empleadosVinculables(): Promise<EmpleadoVinculable[]> {
  return (await repo.listarEmpleadosVinculables()).map((r) => ({
    idEmpleado: r.ID_EMPLEADO, nombre: r.NOMBRE_COMPLETO, codigo: r.CODIGO_EMPLEADO, puesto: r.PUESTO, asignadoA: r.ASIGNADO_A,
  }));
}

export async function listar(q: { page?: unknown; limit?: unknown; search?: unknown }): Promise<PaginatedResponse<UsuarioAdmin>> {
  const { page, limit, offset } = paginar(q.page, q.limit);
  const { rows, total } = await repo.listarUsuarios({ search: String(q.search ?? '').trim().slice(0, 60), offset, limit });
  return { data: rows.map(aUsuario), meta: buildPaginationMeta(total, page, limit) };
}

export async function crear(body: unknown, actor: AccessClaims, ctx: ClientContext): Promise<UsuarioCreado> {
  const parsed = crearUsuarioSchema.safeParse(body);
  if (!parsed.success) throw validacion(parsed.error);
  const { username, nombre, rol } = parsed.data;
  const email = parsed.data.email?.trim() || null;
  const idEmpleado = parsed.data.idEmpleado ?? null;

  if (await authRepo.findUsuarioByUsername(username)) {
    throw campoInvalido('username', `Ya existe un usuario "${username}". Elige otro nombre de usuario.`);
  }
  await validarEmpleado(idEmpleado, 0);

  const claveTemporal = generarClaveTemporal();
  const id = await authRepo.crearUsuario({ username, nombre, email, rol, idEmpleado, passwordHash: await hashPassword(claveTemporal) });
  auditar(actor, 'USUARIO_CREADO', { id, username }, ctx, `rol ${rol}${idEmpleado ? `, empleado #${idEmpleado}` : ''}`);
  return { usuario: aUsuario(await existente(id)), claveTemporal };
}

export async function editar(id: number, body: unknown, actor: AccessClaims, ctx: ClientContext): Promise<UsuarioAdmin> {
  const parsed = editarUsuarioSchema.safeParse(body);
  if (!parsed.success) throw validacion(parsed.error);
  const actual = await existente(id);
  const { nombre, rol, estado } = parsed.data;
  const email = parsed.data.email?.trim() || null;
  // Si no viene idEmpleado se conserva el actual; null lo desvincula.
  const idEmpleado = parsed.data.idEmpleado === undefined ? actual.ID_EMPLEADO : parsed.data.idEmpleado;
  if (idEmpleado !== actual.ID_EMPLEADO) await validarEmpleado(idEmpleado, id);

  const pierdeAdmin = actual.ROL === 'ADMIN' && actual.ESTADO === 'ACTIVO' && (rol !== 'ADMIN' || estado !== 'ACTIVO');
  if (pierdeAdmin) {
    const campo = rol !== 'ADMIN' ? 'rol' : 'estado';
    if (id === actor.sub) {
      throw campoInvalido(campo, 'No puedes quitarte a ti mismo el rol de administrador ni desactivar tu propia cuenta. Pídelo a otro administrador.');
    }
    if ((await repo.contarAdminsActivos(id)) === 0) {
      throw campoInvalido(campo, 'Debe quedar al menos un administrador activo en el sistema.');
    }
  }

  await repo.actualizarUsuario(id, { nombre, email, rol, estado, idEmpleado });

  // Cambiar el rol o desactivar la cuenta cierra sus sesiones: el cambio rige de inmediato.
  if (rol !== actual.ROL || estado !== actual.ESTADO) {
    olvidarSesiones(await authRepo.revocarSesionesDeUsuario(id, estado !== 'ACTIVO' ? 'USUARIO_INACTIVO' : 'CAMBIO_ROL'));
  }
  const cambios = [
    rol !== actual.ROL ? `rol ${actual.ROL} a ${rol}` : '',
    estado !== actual.ESTADO ? `estado ${actual.ESTADO} a ${estado}` : '',
    idEmpleado !== actual.ID_EMPLEADO ? `empleado ${actual.ID_EMPLEADO ?? 'ninguno'} a ${idEmpleado ?? 'ninguno'}` : '',
  ].filter(Boolean).join(', ');
  auditar(actor, 'USUARIO_MODIFICADO', { id, username: actual.USERNAME }, ctx, cambios || 'datos generales');
  return aUsuario(await existente(id));
}

export async function restablecerClave(id: number, actor: AccessClaims, ctx: ClientContext): Promise<{ claveTemporal: string }> {
  const u = await existente(id);
  if (id === actor.sub) {
    throw new BadRequestError('Para cambiar tu propia contraseña usa la opción "Cambiar contraseña" del menú lateral.');
  }
  if (u.ESTADO !== 'ACTIVO') throw new BadRequestError('El usuario está inactivo. Actívalo antes de restablecer su contraseña.');

  const claveTemporal = generarClaveTemporal();
  await repo.asignarClaveTemporal(id, await hashPassword(claveTemporal));
  olvidarSesiones(await authRepo.revocarSesionesDeUsuario(id, 'CLAVE_RESTABLECIDA'));
  auditar(actor, 'CLAVE_RESTABLECIDA', { id, username: u.USERNAME }, ctx);
  return { claveTemporal };
}

export async function desbloquear(id: number, actor: AccessClaims, ctx: ClientContext): Promise<UsuarioAdmin> {
  const u = await existente(id);
  if (u.MIN_BLOQUEO <= 0 && u.INTENTOS_FALLIDOS === 0) throw new BadRequestError('La cuenta no está bloqueada.');
  await repo.desbloquearUsuario(id);
  auditar(actor, 'USUARIO_DESBLOQUEADO', { id, username: u.USERNAME }, ctx);
  return aUsuario(await existente(id));
}

export async function cerrarSesiones(id: number, actor: AccessClaims, ctx: ClientContext): Promise<{ cerradas: number }> {
  const u = await existente(id);
  const ids = await authRepo.revocarSesionesDeUsuario(id, 'CERRADA_POR_ADMIN');
  olvidarSesiones(ids);
  auditar(actor, 'SESIONES_CERRADAS', { id, username: u.USERNAME }, ctx, `${ids.length} sesión(es)`);
  return { cerradas: ids.length };
}

export async function bitacora(q: { page?: unknown; limit?: unknown; search?: unknown }): Promise<PaginatedResponse<BitacoraAcceso>> {
  const { page, limit, offset } = paginar(q.page, q.limit);
  const { rows, total } = await repo.listarBitacora({ search: String(q.search ?? '').trim().slice(0, 60), offset, limit });
  return {
    data: rows.map((r) => ({
      idBitacora: r.ID_BITACORA, username: r.USERNAME, evento: r.EVENTO, ip: r.IP, userAgent: r.USER_AGENT,
      detalle: r.DETALLE, fecha: r.FECHA.toISOString(),
    })),
    meta: buildPaginationMeta(total, page, limit),
  };
}

// --- Gestión de empleados -----------------------------------------------------------

const aEmpleado = (r: repo.EmpleadoAdminRow): EmpleadoAdmin => ({
  idEmpleado: r.ID_EMPLEADO, codigo: r.CODIGO_EMPLEADO, nombre: r.NOMBRE, apellido: r.APELLIDO, nombreCompleto: r.NOMBRE_COMPLETO,
  puesto: r.PUESTO, idSucursal: r.ID_SUCURSAL, nombreSucursal: r.NOMBRE_SUCURSAL,
  email: r.EMAIL, telefono: r.TELEFONO, estado: r.ESTADO, usuarioVinculado: r.USUARIO_VINCULADO,
});

/** Siguiente código libre con el formato EMP-### (reconoce también el formato anterior CXC-EMP-###). */
function siguienteCodigo(codigos: string[]): string {
  const max = codigos.reduce((m, c) => { const n = /^(?:CXC-)?EMP-(\d+)$/.exec(c); return n ? Math.max(m, Number(n[1])) : m; }, 0);
  return `EMP-${String(max + 1).padStart(3, '0')}`;
}

export async function listarEmpleados(q: { page?: unknown; limit?: unknown; search?: unknown; idSucursal?: unknown }): Promise<PaginatedResponse<EmpleadoAdmin>> {
  const { page, limit, offset } = paginar(q.page, q.limit);
  const idSucursal = Number(q.idSucursal) > 0 ? Number(q.idSucursal) : undefined;
  const { rows, total } = await repo.listarEmpleados({ search: String(q.search ?? '').trim().slice(0, 60), idSucursal, offset, limit });
  return { data: rows.map(aEmpleado), meta: buildPaginationMeta(total, page, limit) };
}

async function validarEmpleadoDatos(body: unknown, idActual: number): Promise<repo.EmpleadoDatos> {
  const parsed = empleadoSchema.safeParse(body);
  if (!parsed.success) throw validacion(parsed.error);
  const d = parsed.data;
  const apellido = d.apellido?.trim() || null;

  // El sistema enlaza usuarios por nombre: dos empleados con el mismo nombre lo volverían ambiguo.
  if (await repo.existeEmpleadoConNombre(d.nombre, apellido ?? '', idActual)) {
    throw campoInvalido('nombre', 'Ya existe un empleado con ese nombre completo. Agrega el segundo apellido u otro dato para distinguirlos.');
  }

  // La sucursal es obligatoria, debe existir y estar activa.
  const activa = await repo.sucursalActiva(d.idSucursal);
  if (activa === null) throw campoInvalido('idSucursal', 'La sucursal seleccionada no existe.');
  if (!activa) throw campoInvalido('idSucursal', 'La sucursal seleccionada está inactiva.');

  // El código (EMP-###) lo asigna el sistema y no se edita: se conserva el que ya tenía.
  const codigos = await repo.codigosEmpleado();
  const codigo = idActual ? ((await repo.obtenerEmpleado(idActual))?.CODIGO_EMPLEADO ?? siguienteCodigo(codigos)) : siguienteCodigo(codigos);

  return {
    codigo, nombre: d.nombre, apellido, puesto: d.puesto?.trim() || null, idSucursal: d.idSucursal,
    email: d.email?.trim() || null, telefono: d.telefono?.trim() || null, estado: d.estado ?? 'A',
  };
}

export async function crearEmpleado(body: unknown): Promise<EmpleadoAdmin> {
  const datos = await validarEmpleadoDatos(body, 0);
  const id = await repo.crearEmpleado(datos);
  return aEmpleado((await repo.obtenerEmpleado(id))!);
}

export async function editarEmpleado(id: number, body: unknown): Promise<EmpleadoAdmin> {
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Identificador de empleado no válido.');
  const actual = await repo.obtenerEmpleado(id);
  if (!actual) throw new NotFoundError('El empleado no existe.');
  const datos = await validarEmpleadoDatos(body, id);
  if (datos.estado === 'I' && actual.ESTADO === 'A' && actual.USUARIO_VINCULADO) {
    throw campoInvalido('estado', `No se puede inactivar: está vinculado al usuario "${actual.USUARIO_VINCULADO}". Desvincúlalo primero desde Usuarios.`);
  }
  // Si cambia de sucursal, sus rutas abiertas deben seguir siendo de su sucursal.
  if (datos.idSucursal !== actual.ID_SUCURSAL) {
    const abiertas = await repo.rutasAbiertasDeOtraSucursal(id, datos.idSucursal);
    if (abiertas > 0) {
      throw campoInvalido('idSucursal', `No se puede cambiar de sucursal: tiene ${abiertas} ruta(s) abierta(s) de otra sucursal. Ciérralas o reasígnalas primero.`);
    }
  }
  await repo.actualizarEmpleado(id, datos);
  return aEmpleado((await repo.obtenerEmpleado(id))!);
}
