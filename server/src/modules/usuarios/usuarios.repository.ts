import oracledb from 'oracledb';
import { getConnection } from '../../config/database';
import type { Rol } from '@erp/contracts';

export interface UsuarioAdminRow {
  ID_USUARIO: number;
  USERNAME: string;
  NOMBRE: string;
  EMAIL: string | null;
  ROL: Rol;
  ESTADO: 'ACTIVO' | 'INACTIVO';
  ID_EMPLEADO: number | null;
  NOMBRE_EMPLEADO: string | null;
  DEBE_CAMBIAR_CLAVE: 'S' | 'N';
  INTENTOS_FALLIDOS: number;
  MIN_BLOQUEO: number;
  SESIONES_ACTIVAS: number;
  ULTIMO_LOGIN: Date | null;
  FECHA_CREACION: Date;
}

const SELECT_USUARIO = `
  SELECT u.ID_USUARIO, u.USERNAME, u.NOMBRE, u.EMAIL, u.ROL, u.ESTADO, u.DEBE_CAMBIAR_CLAVE, u.INTENTOS_FALLIDOS,
         u.ULTIMO_LOGIN, u.FECHA_CREACION, u.ID_EMPLEADO,
         TRIM(emp.NOMBRE || ' ' || NVL(emp.APELLIDO, '')) AS NOMBRE_EMPLEADO,
         CASE WHEN u.BLOQUEADO_HASTA IS NOT NULL AND u.BLOQUEADO_HASTA > SYSTIMESTAMP
              THEN CEIL((CAST(u.BLOQUEADO_HASTA AS DATE) - CAST(SYSTIMESTAMP AS DATE)) * 1440) ELSE 0 END AS MIN_BLOQUEO,
         (SELECT COUNT(*) FROM SEG_SESIONES s
           WHERE s.ID_USUARIO = u.ID_USUARIO AND s.FECHA_REVOCADA IS NULL AND s.FECHA_EXPIRA > SYSTIMESTAMP) AS SESIONES_ACTIVAS
    FROM SEG_USUARIOS u
    LEFT JOIN EMPLEADO emp ON emp.ID_EMPLEADO = u.ID_EMPLEADO`;

export async function listarUsuarios(p: { search: string; offset: number; limit: number }): Promise<{ rows: UsuarioAdminRow[]; total: number }> {
  const conn = await getConnection();
  try {
    const filtro = p.search
      ? `WHERE UPPER(u.USERNAME) LIKE :q OR UPPER(u.NOMBRE) LIKE :q OR UPPER(NVL(u.EMAIL, ' ')) LIKE :q`
      : '';
    const binds: Record<string, string> = p.search ? { q: `%${p.search.toUpperCase()}%` } : {};
    const total = await conn.execute<{ N: number }>(`SELECT COUNT(*) AS N FROM SEG_USUARIOS u ${filtro}`, binds);
    const r = await conn.execute<UsuarioAdminRow>(
      `${SELECT_USUARIO} ${filtro} ORDER BY u.ESTADO ASC, u.NOMBRE ASC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...binds, offset: p.offset, limit: p.limit },
    );
    return { rows: r.rows ?? [], total: total.rows?.[0]?.N ?? 0 };
  } finally {
    await conn.close();
  }
}

export async function obtenerUsuarioAdmin(id: number): Promise<UsuarioAdminRow | null> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<UsuarioAdminRow>(`${SELECT_USUARIO} WHERE u.ID_USUARIO = :id`, { id });
    return r.rows?.[0] ?? null;
  } finally {
    await conn.close();
  }
}

export interface EmpleadoVinculableRow {
  ID_EMPLEADO: number;
  NOMBRE_COMPLETO: string;
  CODIGO_EMPLEADO: string | null;
  PUESTO: string | null;
  ESTADO: string;
  ASIGNADO_A: string | null;
}

/** Empleados activos, con el usuario que ya los tiene vinculado (si lo hay). */
export async function listarEmpleadosVinculables(): Promise<EmpleadoVinculableRow[]> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<EmpleadoVinculableRow>(
      `SELECT e.ID_EMPLEADO, TRIM(e.NOMBRE || ' ' || NVL(e.APELLIDO, '')) AS NOMBRE_COMPLETO,
              e.CODIGO_EMPLEADO, e.PUESTO, e.ESTADO,
              (SELECT MIN(u.USERNAME) FROM SEG_USUARIOS u WHERE u.ID_EMPLEADO = e.ID_EMPLEADO) AS ASIGNADO_A
         FROM EMPLEADO e
        WHERE e.ESTADO = 'A'
        ORDER BY NOMBRE_COMPLETO`,
    );
    return r.rows ?? [];
  } finally {
    await conn.close();
  }
}

/** Datos de un empleado para validarlo antes de vincularlo; null si no existe. */
export async function obtenerEmpleadoParaVinculo(idEmpleado: number, excluirIdUsuario: number): Promise<{ activo: boolean; asignadoA: string | null } | null> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ ESTADO: string; ASIGNADO_A: string | null }>(
      `SELECT e.ESTADO,
              (SELECT MIN(u.USERNAME) FROM SEG_USUARIOS u WHERE u.ID_EMPLEADO = e.ID_EMPLEADO AND u.ID_USUARIO <> :excluir) AS ASIGNADO_A
         FROM EMPLEADO e WHERE e.ID_EMPLEADO = :id`,
      { id: idEmpleado, excluir: excluirIdUsuario },
    );
    const row = r.rows?.[0];
    return row ? { activo: row.ESTADO === 'A', asignadoA: row.ASIGNADO_A } : null;
  } finally {
    await conn.close();
  }
}

/** Cuántos administradores activos hay, sin contar a `excluirId` (para no dejar el sistema sin ADMIN). */
export async function contarAdminsActivos(excluirId: number): Promise<number> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ N: number }>(
      `SELECT COUNT(*) AS N FROM SEG_USUARIOS WHERE ROL = 'ADMIN' AND ESTADO = 'ACTIVO' AND ID_USUARIO <> :id`,
      { id: excluirId },
    );
    return r.rows?.[0]?.N ?? 0;
  } finally {
    await conn.close();
  }
}

export async function actualizarUsuario(id: number, d: { nombre: string; email: string | null; rol: Rol; estado: 'ACTIVO' | 'INACTIVO'; idEmpleado: number | null }): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE SEG_USUARIOS SET NOMBRE = :nombre, EMAIL = :email, ROL = :rol, ESTADO = :estado, ID_EMPLEADO = :idEmpleado WHERE ID_USUARIO = :id`,
      { nombre: d.nombre, email: d.email, rol: d.rol, estado: d.estado, idEmpleado: d.idEmpleado, id },
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

/** Deja una clave temporal: obliga a cambiarla y levanta cualquier bloqueo. */
export async function asignarClaveTemporal(id: number, passwordHash: string): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE SEG_USUARIOS
          SET PASSWORD_HASH = :hash, DEBE_CAMBIAR_CLAVE = 'S', FECHA_CLAVE = SYSTIMESTAMP,
              INTENTOS_FALLIDOS = 0, BLOQUEADO_HASTA = NULL
        WHERE ID_USUARIO = :id`,
      { hash: passwordHash, id },
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

export async function desbloquearUsuario(id: number): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(`UPDATE SEG_USUARIOS SET INTENTOS_FALLIDOS = 0, BLOQUEADO_HASTA = NULL WHERE ID_USUARIO = :id`, { id });
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export interface BitacoraRow {
  ID_BITACORA: number;
  USERNAME: string | null;
  EVENTO: string;
  IP: string | null;
  USER_AGENT: string | null;
  DETALLE: string | null;
  FECHA: Date;
}

export async function listarBitacora(p: { search: string; offset: number; limit: number }): Promise<{ rows: BitacoraRow[]; total: number }> {
  const conn = await getConnection();
  try {
    const filtro = p.search
      ? `WHERE UPPER(NVL(USERNAME, ' ')) LIKE :q OR UPPER(EVENTO) LIKE :q OR UPPER(NVL(IP, ' ')) LIKE :q OR UPPER(NVL(DETALLE, ' ')) LIKE :q`
      : '';
    const binds: Record<string, string> = p.search ? { q: `%${p.search.toUpperCase()}%` } : {};
    const total = await conn.execute<{ N: number }>(`SELECT COUNT(*) AS N FROM SEG_BITACORA_ACCESO ${filtro}`, binds);
    const r = await conn.execute<BitacoraRow>(
      `SELECT ID_BITACORA, USERNAME, EVENTO, IP, USER_AGENT, DETALLE, FECHA
         FROM SEG_BITACORA_ACCESO ${filtro} ORDER BY FECHA DESC, ID_BITACORA DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...binds, offset: p.offset, limit: p.limit },
    );
    return { rows: r.rows ?? [], total: total.rows?.[0]?.N ?? 0 };
  } finally {
    await conn.close();
  }
}


// --- Gestión de empleados -----------------------------------------------------------

export interface EmpleadoAdminRow {
  ID_EMPLEADO: number;
  CODIGO_EMPLEADO: string | null;
  NOMBRE: string;
  APELLIDO: string | null;
  NOMBRE_COMPLETO: string;
  PUESTO: string | null;
  ID_SUCURSAL: number | null;
  NOMBRE_SUCURSAL: string | null;
  EMAIL: string | null;
  TELEFONO: string | null;
  ESTADO: 'A' | 'I';
  USUARIO_VINCULADO: string | null;
}

const SELECT_EMPLEADO = `
  SELECT e.ID_EMPLEADO, e.CODIGO_EMPLEADO, e.NOMBRE, e.APELLIDO, TRIM(e.NOMBRE || ' ' || NVL(e.APELLIDO, '')) AS NOMBRE_COMPLETO,
         e.PUESTO, e.ID_SUCURSAL, s.NOMBRE AS NOMBRE_SUCURSAL, e.EMAIL, e.TELEFONO, e.ESTADO,
         (SELECT MIN(u.USERNAME) FROM SEG_USUARIOS u WHERE u.ID_EMPLEADO = e.ID_EMPLEADO) AS USUARIO_VINCULADO
    FROM EMPLEADO e
    LEFT JOIN CXC_SUCURSALES s ON s.ID_SUCURSAL = e.ID_SUCURSAL`;

export async function listarEmpleados(p: { search: string; idSucursal?: number; offset: number; limit: number }): Promise<{ rows: EmpleadoAdminRow[]; total: number }> {
  const conn = await getConnection();
  try {
    const condiciones: string[] = [];
    const binds: Record<string, string | number> = {};
    if (p.search) {
      condiciones.push(`(UPPER(e.NOMBRE || ' ' || NVL(e.APELLIDO, '')) LIKE :q OR UPPER(NVL(e.CODIGO_EMPLEADO, ' ')) LIKE :q OR UPPER(NVL(e.PUESTO, ' ')) LIKE :q)`);
      binds.q = `%${p.search.toUpperCase()}%`;
    }
    if (p.idSucursal) {
      condiciones.push('e.ID_SUCURSAL = :idSucursal');
      binds.idSucursal = p.idSucursal;
    }
    const filtro = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const total = await conn.execute<{ N: number }>(`SELECT COUNT(*) AS N FROM EMPLEADO e ${filtro}`, binds);
    const r = await conn.execute<EmpleadoAdminRow>(
      `${SELECT_EMPLEADO} ${filtro} ORDER BY e.ESTADO ASC, e.NOMBRE ASC, e.APELLIDO ASC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...binds, offset: p.offset, limit: p.limit },
    );
    return { rows: r.rows ?? [], total: total.rows?.[0]?.N ?? 0 };
  } finally {
    await conn.close();
  }
}

export async function obtenerEmpleado(id: number): Promise<EmpleadoAdminRow | null> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<EmpleadoAdminRow>(`${SELECT_EMPLEADO} WHERE e.ID_EMPLEADO = :id`, { id });
    return r.rows?.[0] ?? null;
  } finally {
    await conn.close();
  }
}

/** Sucursal activa: debe existir y estar activa para poder asignarse a un empleado. */
export async function sucursalActiva(idSucursal: number): Promise<boolean | null> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ ESTADO: string }>('SELECT ESTADO FROM CXC_SUCURSALES WHERE ID_SUCURSAL = :id', { id: idSucursal });
    return r.rows?.length ? String(r.rows[0].ESTADO).trim() === 'A' : null;
  } finally {
    await conn.close();
  }
}

/** Rutas abiertas del empleado que pertenecen a una sucursal distinta de la indicada. */
export async function rutasAbiertasDeOtraSucursal(idEmpleado: number, idSucursal: number): Promise<number> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ N: number }>(
      `SELECT COUNT(*) AS N FROM CXC_RUTAS
        WHERE ID_EMPLEADO = :idEmpleado AND TRIM(ESTADO) IN ('PLANIFICADA', 'EN_PROCESO')
          AND (ID_SUCURSAL IS NULL OR ID_SUCURSAL <> :idSucursal)`,
      { idEmpleado, idSucursal },
    );
    return Number(r.rows?.[0]?.N ?? 0);
  } finally {
    await conn.close();
  }
}

/** Todos los códigos existentes, para calcular el siguiente EMP-###. */
export async function codigosEmpleado(): Promise<string[]> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ C: string }>(`SELECT CODIGO_EMPLEADO AS C FROM EMPLEADO WHERE CODIGO_EMPLEADO IS NOT NULL`);
    return (r.rows ?? []).map((x) => x.C);
  } finally {
    await conn.close();
  }
}

/** Otro empleado con el mismo nombre completo (sin distinguir mayúsculas ni acentos). */
export async function existeEmpleadoConNombre(nombre: string, apellido: string, excluirId: number): Promise<boolean> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ N: number }>(
      `SELECT COUNT(*) AS N FROM EMPLEADO
        WHERE ID_EMPLEADO <> :excluir
          AND NLSSORT(TRIM(NOMBRE || ' ' || NVL(APELLIDO, '')), 'NLS_SORT=BINARY_AI') = NLSSORT(TRIM(:nombre || ' ' || :apellido), 'NLS_SORT=BINARY_AI')`,
      { excluir: excluirId, nombre, apellido },
    );
    return (r.rows?.[0]?.N ?? 0) > 0;
  } finally {
    await conn.close();
  }
}

export interface EmpleadoDatos {
  codigo: string; nombre: string; apellido: string | null; puesto: string | null; idSucursal: number;
  email: string | null; telefono: string | null; estado: 'A' | 'I';
}

export async function crearEmpleado(d: EmpleadoDatos): Promise<number> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ id: number[] }>(
      `INSERT INTO EMPLEADO (CODIGO_EMPLEADO, NOMBRE, APELLIDO, PUESTO, ID_SUCURSAL, EMAIL, TELEFONO, ESTADO)
       VALUES (:codigo, :nombre, :apellido, :puesto, :idSucursal, :email, :telefono, :estado)
       RETURNING ID_EMPLEADO INTO :id`,
      { ...d, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
    );
    await conn.commit();
    return r.outBinds!.id[0];
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

export async function actualizarEmpleado(id: number, d: EmpleadoDatos): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE EMPLEADO SET CODIGO_EMPLEADO = :codigo, NOMBRE = :nombre, APELLIDO = :apellido, PUESTO = :puesto,
              ID_SUCURSAL = :idSucursal, EMAIL = :email, TELEFONO = :telefono, ESTADO = :estado WHERE ID_EMPLEADO = :id`,
      { ...d, id },
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}
