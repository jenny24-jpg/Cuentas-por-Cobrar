import type { Request } from 'express';
import type { Connection } from 'oracledb';
import { getConnection } from '../../config/database';
import { BadRequestError, UnauthorizedError } from '../../shared/errors/AppError';

const SIN_EMPLEADO =
  'Tu usuario no tiene un empleado asignado y no se encontró un empleado con tu mismo nombre. Pide al administrador que lo asigne para poder registrar información.';

/**
 * Busca el empleado que corresponde al usuario por nombre completo (sin distinguir
 * mayúsculas ni acentos) y, si hay exactamente uno, deja el vínculo guardado en
 * SEG_USUARIOS.ID_EMPLEADO para no volver a buscarlo. Con 0 o varias coincidencias
 * no adivina: devuelve null.
 */
async function vincularPorNombre(conn: Connection, idUsuario: number): Promise<number | null> {
  const u = await conn.execute<{ NOMBRE: string | null }>(
    'SELECT NOMBRE FROM SEG_USUARIOS WHERE ID_USUARIO = :id',
    { id: idUsuario },
  );
  const nombre = u.rows?.[0]?.NOMBRE?.trim();
  if (!nombre) return null;

  const r = await conn.execute<{ ID_EMPLEADO: number }>(
    `SELECT ID_EMPLEADO FROM EMPLEADO
      WHERE NLSSORT(TRIM(NOMBRE || ' ' || NVL(APELLIDO, '')), 'NLS_SORT=BINARY_AI')
          = NLSSORT(:nombre, 'NLS_SORT=BINARY_AI')`,
    { nombre },
  );
  if ((r.rows?.length ?? 0) !== 1) return null;

  const idEmpleado = Number(r.rows![0].ID_EMPLEADO);
  await conn.execute(
    'UPDATE SEG_USUARIOS SET ID_EMPLEADO = :idEmpleado WHERE ID_USUARIO = :id AND ID_EMPLEADO IS NULL',
    { idEmpleado, id: idUsuario },
    { autoCommit: true },
  );
  return idEmpleado;
}

/**
 * Devuelve el ID_EMPLEADO ligado al usuario que inició sesión (SEG_USUARIOS.ID_EMPLEADO).
 * Se usa para registrar automáticamente quién crea un registro, en lugar de
 * pedirlo en el formulario. Se consulta en cada petición para respetar
 * cambios de asignación sin esperar a que expire el token.
 *
 * Si el usuario aún no tiene empleado, se asigna solo cuando existe un único
 * empleado con el mismo nombre que el usuario.
 */
export async function empleadoDelUsuario(req: Request): Promise<number> {
  const idUsuario = req.auth?.sub;
  if (!idUsuario) throw new UnauthorizedError('Inicia sesión para continuar.');
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ ID_EMPLEADO: number | null }>(
      'SELECT ID_EMPLEADO FROM SEG_USUARIOS WHERE ID_USUARIO = :id',
      { id: idUsuario },
    );
    const idEmpleado = r.rows?.[0]?.ID_EMPLEADO ?? (await vincularPorNombre(conn, Number(idUsuario)));
    if (!idEmpleado) throw new BadRequestError(SIN_EMPLEADO);
    return Number(idEmpleado);
  } finally {
    await conn.close();
  }
}

/** Copia el body agregando el empleado del usuario logueado en el campo indicado. */
export async function conEmpleadoActual<T extends object>(req: Request, campo = 'idEmpleado'): Promise<T & Record<string, number>> {
  const idEmpleado = await empleadoDelUsuario(req);
  return { ...(req.body ?? {}), [campo]: idEmpleado } as T & Record<string, number>;
}
