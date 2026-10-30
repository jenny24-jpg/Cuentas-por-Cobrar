import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type { EstadoSolicitudReversa, SolicitudReversa, TipoSolicitudReversa } from '@erp/contracts';
import { ConflictError, NotFoundError } from '../../../../shared/errors/AppError';

interface Row {
  ID_SOLICITUD: number; TIPO: TipoSolicitudReversa; ID_REGISTRO: number; REFERENCIA: string | null; MONTO: number | null;
  MOTIVO: string; ESTADO: EstadoSolicitudReversa; ID_USUARIO_SOLICITA: number; SOLICITANTE: string | null; ROL_SOLICITANTE: string | null;
  FECHA_SOLICITUD: string; ID_USUARIO_RESUELVE: number | null; RESOLVIO: string | null; FECHA_RESOLUCION: string | null; MOTIVO_RECHAZO: string | null;
  ID_EMPLEADO_SOLICITA: number;
}

const map = (r: Row): SolicitudReversa & { idEmpleadoSolicita: number } => ({
  idSolicitud: r.ID_SOLICITUD,
  tipo: r.TIPO,
  idRegistro: r.ID_REGISTRO,
  referencia: r.REFERENCIA,
  monto: r.MONTO == null ? null : Number(r.MONTO),
  motivo: r.MOTIVO,
  estado: r.ESTADO,
  idUsuarioSolicita: r.ID_USUARIO_SOLICITA,
  solicitante: r.SOLICITANTE,
  rolSolicitante: r.ROL_SOLICITANTE,
  fechaSolicitud: r.FECHA_SOLICITUD,
  idUsuarioResuelve: r.ID_USUARIO_RESUELVE,
  resolvio: r.RESOLVIO,
  fechaResolucion: r.FECHA_RESOLUCION,
  motivoRechazo: r.MOTIVO_RECHAZO,
  idEmpleadoSolicita: r.ID_EMPLEADO_SOLICITA,
});

const SELECT_BASE = `
  SELECT s.ID_SOLICITUD, s.TIPO, s.ID_REGISTRO, s.REFERENCIA, s.MONTO, s.MOTIVO, s.ESTADO,
         s.ID_USUARIO_SOLICITA, us.NOMBRE AS SOLICITANTE, TRIM(us.ROL) AS ROL_SOLICITANTE,
         TO_CHAR(s.FECHA_SOLICITUD, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_SOLICITUD,
         s.ID_USUARIO_RESUELVE, ur.NOMBRE AS RESOLVIO,
         TO_CHAR(s.FECHA_RESOLUCION, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_RESOLUCION,
         s.MOTIVO_RECHAZO, s.ID_EMPLEADO_SOLICITA
    FROM CXC_SOLICITUDES_REVERSA s
    JOIN SEG_USUARIOS us ON us.ID_USUARIO = s.ID_USUARIO_SOLICITA
    LEFT JOIN SEG_USUARIOS ur ON ur.ID_USUARIO = s.ID_USUARIO_RESUELVE
`;

const DOC = (alias: string) => `TRIM(BOTH '-' FROM ${alias}.SERIE || '-' || ${alias}.NUMERO_DOCUMENTO)`;

/**
 * Por cada tipo: cómo leer el registro, si todavía admite la operación y qué
 * referencia y monto mostrar en la solicitud. ABIERTO = 1 si aún puede reversarse/anularse.
 */
const OBJETIVO: Record<TipoSolicitudReversa, string> = {
  REVERSA_APLICACION_PAGO: `
    SELECT p.NUMERO_REFERENCIA || ' → ' || ${DOC('d')} AS REFERENCIA, ap.MONTO_APLICADO AS MONTO,
           CASE WHEN ap.ESTADO = 'CONFIRMADA' THEN 1 ELSE 0 END AS ABIERTO
      FROM CXC_APLICACION_PAGOS ap JOIN CXC_PAGOS p ON p.ID_PAGO = ap.ID_PAGO JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO = ap.ID_DOCUMENTO
     WHERE ap.ID_APLICACION = :id`,
  REVERSA_APLICACION_ANTICIPO: `
    SELECT 'Anticipo #' || a.ID_ANTICIPO || ' → ' || ${DOC('d')} AS REFERENCIA, a.MONTO_APLICADO AS MONTO,
           CASE WHEN a.ESTADO = 'CONFIRMADA' THEN 1 ELSE 0 END AS ABIERTO
      FROM CXC_APLICACION_ANTICIPO a JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO = a.ID_DOCUMENTO
     WHERE a.ID_APLICACION_ANTICIPO = :id`,
  REVERSA_APLICACION_NC: `
    SELECT TRIM(BOTH '-' FROM n.SERIE || '-' || n.NUMERO) || ' → ' || ${DOC('d')} AS REFERENCIA, a.MONTO_APLICADO AS MONTO,
           CASE WHEN a.ESTADO = 'CONFIRMADA' THEN 1 ELSE 0 END AS ABIERTO
      FROM CXC_APLICACION_NOTA_CREDITO a JOIN CXC_NOTAS_CREDITO n ON n.ID_NOTA_CREDITO = a.ID_NOTA_CREDITO
      JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO = a.ID_DOCUMENTO
     WHERE a.ID_APLICACION_NC = :id`,
  ANULACION_PAGO: `
    SELECT NVL(p.NUMERO_REFERENCIA, 'Pago #' || p.ID_PAGO) || ' · ' || c.NOMBRE AS REFERENCIA, p.MONTO,
           CASE WHEN UPPER(TRIM(p.ESTADO)) IN ('ANULADO', 'REVERSADO') THEN 0 ELSE 1 END AS ABIERTO
      FROM CXC_PAGOS p JOIN CLIENTE c ON c.ID_CLIENTE = p.ID_CLIENTE
     WHERE p.ID_PAGO = :id`,
  ANULACION_ANTICIPO: `
    SELECT 'Anticipo #' || a.ID_ANTICIPO || ' · ' || c.NOMBRE AS REFERENCIA, a.MONTO_ORIGINAL AS MONTO,
           CASE WHEN UPPER(TRIM(a.ESTADO)) = 'CANCELADO' THEN 0 ELSE 1 END AS ABIERTO
      FROM CXC_ANTICIPOS a JOIN CLIENTE c ON c.ID_CLIENTE = a.ID_CLIENTE
     WHERE a.ID_ANTICIPO = :id`,
  ANULACION_NOTA_CREDITO: `
    SELECT TRIM(BOTH '-' FROM n.SERIE || '-' || n.NUMERO) || ' · ' || c.NOMBRE AS REFERENCIA, n.MONTO,
           CASE WHEN UPPER(TRIM(n.ESTADO)) = 'ANULADA' THEN 0 ELSE 1 END AS ABIERTO
      FROM CXC_NOTAS_CREDITO n JOIN CLIENTE c ON c.ID_CLIENTE = n.ID_CLIENTE
     WHERE n.ID_NOTA_CREDITO = :id`,
  ANULACION_DOCUMENTO: `
    SELECT ${DOC('d')} || ' · ' || c.NOMBRE AS REFERENCIA, d.TOTAL AS MONTO,
           CASE WHEN UPPER(TRIM(d.ESTADO)) IN ('ANULADO', 'ANULADA', 'PAGADO', 'PAGADA') THEN 0 ELSE 1 END AS ABIERTO
      FROM CXC_DOCUMENTOS d JOIN CLIENTE c ON c.ID_CLIENTE = d.ID_CLIENTE
     WHERE d.ID_DOCUMENTO = :id`,
  ANULACION_FACTURA_FEL: `
    SELECT f.SERIE_FEL || '-' || f.NUMERO_FEL || ' · ' || f.NOMBRE_RECEPTOR AS REFERENCIA, f.TOTAL AS MONTO,
           CASE WHEN f.ESTADO = 'ANULADA' THEN 0 ELSE 1 END AS ABIERTO
      FROM CXC_FACTURA_FEL f
     WHERE f.ID_FACTURA_FEL = :id`,
};

/** Referencia, monto y si el registro todavía admite la operación; null si no existe. */
export async function leerObjetivo(tipo: TipoSolicitudReversa, id: number): Promise<{ referencia: string; monto: number; abierto: boolean } | null> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ REFERENCIA: string; MONTO: number; ABIERTO: number }>(OBJETIVO[tipo], { id });
    const row = r.rows?.[0];
    return row ? { referencia: String(row.REFERENCIA ?? '').slice(0, 200), monto: Number(row.MONTO), abierto: Number(row.ABIERTO) === 1 } : null;
  } finally {
    await conn.close();
  }
}

/** ORA-00001 sobre UX_CXC_SR_PENDIENTE: ya hay una solicitud pendiente para lo mismo. */
const esPendienteRepetida = (err: unknown) =>
  (err as { errorNum?: number })?.errorNum === 1 && String((err as Error).message).includes('UX_CXC_SR_PENDIENTE');

export async function create(i: {
  tipo: TipoSolicitudReversa; idRegistro: number; referencia: string; monto: number; motivo: string;
  idUsuario: number; idEmpleado: number;
}): Promise<number> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ id: number[] }>(
      `INSERT INTO CXC_SOLICITUDES_REVERSA
         (TIPO, ID_REGISTRO, REFERENCIA, MONTO, MOTIVO, ESTADO, ID_USUARIO_SOLICITA, ID_EMPLEADO_SOLICITA, FECHA_SOLICITUD)
       VALUES (:tipo, :idRegistro, :referencia, :monto, :motivo, 'PENDIENTE', :idUsuario, :idEmpleado, SYSDATE)
       RETURNING ID_SOLICITUD INTO :id`,
      { ...i, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
    );
    await conn.commit();
    return r.outBinds!.id[0];
  } catch (err) {
    await conn.rollback();
    if (esPendienteRepetida(err)) throw new ConflictError('Ya hay una solicitud pendiente para esta operación; espera a que un administrador la resuelva.');
    throw err;
  } finally {
    await conn.close();
  }
}

export async function findById(id: number) {
  const conn = await getConnection();
  try {
    const r = await conn.execute<Row>(`${SELECT_BASE} WHERE s.ID_SOLICITUD = :id`, { id });
    return r.rows?.[0] ? map(r.rows[0]) : null;
  } finally {
    await conn.close();
  }
}

export async function findAll(p: { page: number; limit: number; estado?: EstadoSolicitudReversa; search?: string }) {
  const conn = await getConnection();
  try {
    const filtros: string[] = [];
    const binds: Record<string, string | number> = {};
    if (p.estado) { filtros.push('s.ESTADO = :estado'); binds.estado = p.estado; }
    if (p.search) {
      filtros.push(`(UPPER(NVL(s.REFERENCIA, '')) LIKE UPPER(:search) OR UPPER(s.MOTIVO) LIKE UPPER(:search)
                     OR UPPER(us.NOMBRE) LIKE UPPER(:search) OR TO_CHAR(s.ID_SOLICITUD) LIKE :search)`);
      binds.search = `%${p.search}%`;
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const data = await conn.execute<Row>(
      `${SELECT_BASE} ${where}
       ORDER BY CASE WHEN s.ESTADO = 'PENDIENTE' THEN 0 ELSE 1 END, s.FECHA_SOLICITUD DESC, s.ID_SOLICITUD DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...binds, offset: (p.page - 1) * p.limit, limit: p.limit },
    );
    const total = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL FROM CXC_SOLICITUDES_REVERSA s JOIN SEG_USUARIOS us ON us.ID_USUARIO = s.ID_USUARIO_SOLICITA ${where}`,
      binds,
    );
    return { data: (data.rows ?? []).map(map), total: Number(total.rows?.[0]?.TOTAL ?? 0) };
  } finally {
    await conn.close();
  }
}

/** Ids con solicitud pendiente de un tipo (para marcar las filas en cada pantalla). */
export async function pendientesPorTipo(tipo: TipoSolicitudReversa): Promise<number[]> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ ID_REGISTRO: number }>(
      `SELECT ID_REGISTRO FROM CXC_SOLICITUDES_REVERSA WHERE TIPO = :tipo AND ESTADO = 'PENDIENTE'`, { tipo });
    return (r.rows ?? []).map((x) => Number(x.ID_REGISTRO));
  } finally {
    await conn.close();
  }
}

export async function contarPendientes(): Promise<number> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<{ TOTAL: number }>(`SELECT COUNT(*) AS TOTAL FROM CXC_SOLICITUDES_REVERSA WHERE ESTADO = 'PENDIENTE'`);
    return Number(r.rows?.[0]?.TOTAL ?? 0);
  } finally {
    await conn.close();
  }
}

/**
 * Pasa una solicitud PENDIENTE a su estado final. Solo cambia si sigue PENDIENTE:
 * si dos administradores la resuelven a la vez, el segundo recibe un 409.
 */
export async function resolver(id: number, i: {
  estado: Exclude<EstadoSolicitudReversa, 'PENDIENTE'>; idUsuario: number; motivoRechazo?: string | null;
}): Promise<void> {
  const conn = await getConnection();
  try {
    const r = await conn.execute(
      `UPDATE CXC_SOLICITUDES_REVERSA
          SET ESTADO = :estado, ID_USUARIO_RESUELVE = :idUsuario, FECHA_RESOLUCION = SYSDATE, MOTIVO_RECHAZO = :motivoRechazo
        WHERE ID_SOLICITUD = :id AND ESTADO = 'PENDIENTE'`,
      { estado: i.estado, idUsuario: i.idUsuario, motivoRechazo: i.motivoRechazo ?? null, id },
    );
    if (!r.rowsAffected) {
      const existe = await conn.execute(`SELECT 1 FROM CXC_SOLICITUDES_REVERSA WHERE ID_SOLICITUD = :id`, { id });
      if (!existe.rows?.length) throw new NotFoundError(`Solicitud ${id} no encontrada`);
      throw new ConflictError('Esta solicitud ya fue resuelta por otro usuario.');
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

/** Devuelve a PENDIENTE una solicitud cuya ejecución falló después de tomarla. */
export async function liberar(id: number): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE CXC_SOLICITUDES_REVERSA
          SET ESTADO = 'PENDIENTE', ID_USUARIO_RESUELVE = NULL, FECHA_RESOLUCION = NULL
        WHERE ID_SOLICITUD = :id AND ESTADO = 'APROBADA'`,
      { id },
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}
