import oracledb, { type Connection } from 'oracledb';
import { getConnection } from '../../../../config/database';
import { TRANSICIONES_RUTA, distanciaKm, type Ruta, type RutasPorEmpleado, type CreateRutaInput, type UpdateRutaInput } from '@erp/contracts';
import { NotFoundError, ConflictError } from '../../../../shared/errors/AppError';

interface RutaRow {
  ID_RUTA: number;
  CODIGO_RUTA: string | null;
  NOMBRE: string;
  ID_EMPLEADO: number;
  NOMBRE_EMPLEADO: string | null;
  FECHA: Date | null;
  ESTADO: string;
  OBSERVACIONES: string;
  RADIO_KM: number | null;
}

function mapRow(row: RutaRow): Ruta {
  return {
    idRuta: row.ID_RUTA,
    codigoRuta: row.CODIGO_RUTA,
    nombre: row.NOMBRE,
    idEmpleado: row.ID_EMPLEADO,
    nombreEmpleado: row.NOMBRE_EMPLEADO,
    fecha: row.FECHA?.toISOString() ?? null,
    estado: row.ESTADO?.trim(),
    observaciones: row.OBSERVACIONES,
    radioKm: Number(row.RADIO_KM ?? 5),
  };
}

// OJO: la tabla de empleados en la base se llama EMPLEADO (no CXC_EMPLEADOS).
// LEFT JOIN (no JOIN normal): un ID_EMPLEADO huérfano no debe hacer
// desaparecer la ruta de los listados ni causar un falso 404 en findById.
const SELECT_BASE = `
  SELECT r.ID_RUTA, r.CODIGO_RUTA, r.NOMBRE, r.ID_EMPLEADO,
         (e.NOMBRE || ' ' || e.APELLIDO) AS NOMBRE_EMPLEADO,
         r.FECHA, r.ESTADO, r.OBSERVACIONES, r.RADIO_KM
  FROM CXC_RUTAS r
  LEFT JOIN EMPLEADO e ON e.ID_EMPLEADO = r.ID_EMPLEADO
`;

/** Búsqueda por nombre o código de ruta, estado o nombre del empleado; filtro opcional por empleado. */
function filtroRutas(params: { search?: string; idEmpleado?: number; fecha?: string; excluirId?: number }) {
  const condiciones: string[] = [];
  const binds: Record<string, string | number> = {};
  if (params.search) {
    condiciones.push(`(UPPER(r.NOMBRE) LIKE UPPER(:search) OR UPPER(r.CODIGO_RUTA) LIKE UPPER(:search)
      OR UPPER(r.ESTADO) LIKE UPPER(:search) OR UPPER(e.NOMBRE || ' ' || e.APELLIDO) LIKE UPPER(:search))`);
    binds.search = `%${params.search}%`;
  }
  if (params.idEmpleado) {
    condiciones.push('r.ID_EMPLEADO = :idEmpleado');
    binds.idEmpleado = params.idEmpleado;
  }
  if (params.fecha) {
    condiciones.push(`TRUNC(r.FECHA) = TO_DATE(:fecha, 'YYYY-MM-DD')`);
    binds.fecha = params.fecha;
  }
  if (params.excluirId) {
    condiciones.push('r.ID_RUTA <> :excluirId');
    binds.excluirId = params.excluirId;
  }
  return { where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', binds };
}

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
  idEmpleado?: number;
  fecha?: string;
  excluirId?: number;
}): Promise<{ data: Ruta[]; total: number }> {
  const conn = await getConnection();
  try {
    const offset = (params.page - 1) * params.limit;
    const { where: whereClause, binds: searchBind } = filtroRutas(params);

    const dataResult = await conn.execute<RutaRow>(
      `${SELECT_BASE} ${whereClause}
       ORDER BY r.FECHA DESC NULLS LAST, r.ID_RUTA DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...searchBind, offset, limit: params.limit },
    );

    const countResult = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL FROM CXC_RUTAS r LEFT JOIN EMPLEADO e ON e.ID_EMPLEADO = r.ID_EMPLEADO ${whereClause}`,
      searchBind,
    );

    const total = countResult.rows?.[0]?.TOTAL ?? 0;
    return { data: (dataResult.rows ?? []).map(mapRow), total };
  } finally {
    await conn.close();
  }
}

/** Rutas agrupadas por empleado (con la misma búsqueda del listado), ordenadas por nombre. */
export async function resumenPorEmpleado(params: { search?: string }): Promise<RutasPorEmpleado[]> {
  const conn = await getConnection();
  try {
    const { where, binds } = filtroRutas(params);
    const result = await conn.execute<{
      ID_EMPLEADO: number; NOMBRE_EMPLEADO: string | null; TOTAL: number; PLANIFICADAS: number; EN_PROCESO: number;
      COMPLETADAS: number; CANCELADAS: number; PROXIMA: Date | null; ULTIMA: Date | null;
    }>(
      `SELECT r.ID_EMPLEADO,
              MAX(e.NOMBRE || ' ' || e.APELLIDO) AS NOMBRE_EMPLEADO,
              COUNT(*) AS TOTAL,
              COUNT(CASE WHEN TRIM(r.ESTADO) = 'PLANIFICADA' THEN 1 END) AS PLANIFICADAS,
              COUNT(CASE WHEN TRIM(r.ESTADO) = 'EN_PROCESO' THEN 1 END) AS EN_PROCESO,
              COUNT(CASE WHEN TRIM(r.ESTADO) = 'COMPLETADA' THEN 1 END) AS COMPLETADAS,
              COUNT(CASE WHEN TRIM(r.ESTADO) = 'CANCELADA' THEN 1 END) AS CANCELADAS,
              MIN(CASE WHEN TRIM(r.ESTADO) IN ('PLANIFICADA', 'EN_PROCESO') THEN r.FECHA END) AS PROXIMA,
              MAX(r.FECHA) AS ULTIMA
         FROM CXC_RUTAS r
         LEFT JOIN EMPLEADO e ON e.ID_EMPLEADO = r.ID_EMPLEADO
        ${where}
        GROUP BY r.ID_EMPLEADO
        ORDER BY MAX(e.NOMBRE || ' ' || e.APELLIDO) NULLS LAST, r.ID_EMPLEADO`,
      binds,
    );
    return (result.rows ?? []).map((row) => ({
      idEmpleado: row.ID_EMPLEADO,
      nombreEmpleado: row.NOMBRE_EMPLEADO?.trim() || null,
      totalRutas: Number(row.TOTAL),
      planificadas: Number(row.PLANIFICADAS),
      enProceso: Number(row.EN_PROCESO),
      completadas: Number(row.COMPLETADAS),
      canceladas: Number(row.CANCELADAS),
      proximaFecha: row.PROXIMA?.toISOString() ?? null,
      ultimaFecha: row.ULTIMA?.toISOString() ?? null,
    }));
  } finally {
    await conn.close();
  }
}

export async function findById(id: number): Promise<Ruta | null> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<RutaRow>(`${SELECT_BASE} WHERE r.ID_RUTA = :id`, { id });
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

export async function create(input: CreateRutaInput): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ id: number[] }>(
      `INSERT INTO CXC_RUTAS (CODIGO_RUTA, NOMBRE, ID_EMPLEADO, FECHA, ESTADO, OBSERVACIONES, RADIO_KM)
       VALUES (:codigoRuta, :nombre, :idEmpleado, TO_DATE(:fecha, 'YYYY-MM-DD'), 'PLANIFICADA', :observaciones, :radioKm)
       RETURNING ID_RUTA INTO :id`,
      {
        codigoRuta: input.codigoRuta ?? null,
        nombre: input.nombre,
        idEmpleado: input.idEmpleado,
        fecha: input.fecha,
        radioKm: input.radioKm,
        // OBSERVACIONES es NOT NULL en Oracle: si no mandan nada, '' en vez de null.
        observaciones: input.observaciones ?? '',
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
    );
    await conn.commit();
    return result.outBinds!.id[0];
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

export async function update(id: number, input: UpdateRutaInput): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, any> = { id };

  if (input.codigoRuta !== undefined) { fields.push('CODIGO_RUTA = :codigoRuta'); binds.codigoRuta = input.codigoRuta; }
  if (input.nombre !== undefined) { fields.push('NOMBRE = :nombre'); binds.nombre = input.nombre; }
  if (input.idEmpleado !== undefined) { fields.push('ID_EMPLEADO = :idEmpleado'); binds.idEmpleado = input.idEmpleado; }
  if (input.fecha !== undefined) { fields.push(`FECHA = TO_DATE(:fecha, 'YYYY-MM-DD')`); binds.fecha = input.fecha; }
  if (input.estado !== undefined) { fields.push('ESTADO = :estado'); binds.estado = input.estado; }
  if (input.observaciones !== undefined) { fields.push('OBSERVACIONES = :observaciones'); binds.observaciones = input.observaciones ?? ''; }
  if (input.radioKm !== undefined) { fields.push('RADIO_KM = :radioKm'); binds.radioKm = input.radioKm; }

  if (fields.length === 0) {
    if (!(await findById(id))) throw new NotFoundError(`Ruta ${id} no encontrada`);
    return;
  }

  const conn = await getConnection();
  try {
    const actual = await conn.execute<{ ESTADO: string; ID_EMPLEADO: number; RADIO_KM: number }>(
      'SELECT ESTADO, ID_EMPLEADO, RADIO_KM FROM CXC_RUTAS WHERE ID_RUTA=:id FOR UPDATE', { id });
    if (!actual.rows?.length) throw new NotFoundError(`Ruta ${id} no encontrada`);
    const estadoActual = actual.rows[0].ESTADO.trim();
    if (['COMPLETADA', 'CANCELADA'].includes(estadoActual)) {
      throw new ConflictError('Una ruta cerrada conserva su historial y no puede modificarse; crea otra ruta');
    }
    await validarCambios(conn, id, estadoActual, actual.rows[0], input);
    const result = await conn.execute(`UPDATE CXC_RUTAS SET ${fields.join(', ')} WHERE ID_RUTA = :id`, binds);
    if (!result.rowsAffected) throw new NotFoundError(`Ruta ${id} no encontrada`);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

/** Paradas con documento de la ruta: total, pendientes de visitar y cobros confirmados. */
async function resumenParadas(conn: Connection, idRuta: number) {
  const r = await conn.execute<{ TOTAL: number; PENDIENTES: number; COBROS: number }>(
    `SELECT p.TOTAL, p.PENDIENTES,
            (SELECT COUNT(*) FROM CXC_APLICACION_PAGOS ap JOIN CXC_RUTA_DETALLE x ON x.ID_RUTA_DETALLE = ap.ID_RUTA_DETALLE
              WHERE x.ID_RUTA = :idRuta AND ap.ESTADO = 'CONFIRMADA') AS COBROS
       FROM (SELECT COUNT(*) AS TOTAL,
                    COUNT(CASE WHEN NVL(d.ESTADO_VISITA, 'PENDIENTE') = 'PENDIENTE' THEN 1 END) AS PENDIENTES
               FROM CXC_RUTA_DETALLE d WHERE d.ID_RUTA = :idRuta AND d.ID_DOCUMENTO IS NOT NULL) p`, { idRuta });
  return { total: Number(r.rows?.[0]?.TOTAL ?? 0), pendientes: Number(r.rows?.[0]?.PENDIENTES ?? 0), cobros: Number(r.rows?.[0]?.COBROS ?? 0) };
}

/**
 * Reglas al editar una ruta abierta:
 * - Estado: solo transiciones válidas; COMPLETADA exige paradas y ninguna pendiente de visitar.
 * - Responsable: un cobrador por ruta; si cambia, pasa a todas sus paradas, salvo que ya haya cobros.
 * - Radio: no puede dejar fuera paradas que ya están asignadas.
 */
async function validarCambios(
  conn: Connection, id: number, estadoActual: string,
  actual: { ID_EMPLEADO: number; RADIO_KM: number }, input: UpdateRutaInput,
) {
  if (input.estado && input.estado !== estadoActual) {
    if (!(TRANSICIONES_RUTA[estadoActual] ?? []).includes(input.estado)) {
      throw new ConflictError(`Una ruta ${estadoActual.replace('_', ' ').toLowerCase()} no puede pasar a ${input.estado.replace('_', ' ').toLowerCase()}.`);
    }
    if (input.estado === 'COMPLETADA') {
      const p = await resumenParadas(conn, id);
      if (p.total === 0) throw new ConflictError('No se puede completar una ruta sin paradas asignadas.');
      if (p.pendientes > 0) {
        throw new ConflictError(`No se puede completar la ruta: ${p.pendientes} parada(s) siguen pendientes. Registra su visita, "No encontrado" o reprogramación.`);
      }
    }
  }

  if (input.idEmpleado !== undefined && input.idEmpleado !== actual.ID_EMPLEADO) {
    const p = await resumenParadas(conn, id);
    if (p.cobros > 0) throw new ConflictError('La ruta ya tiene cobros aplicados; no se puede cambiar su responsable. Crea otra ruta para el nuevo cobrador.');
    await conn.execute(`UPDATE CXC_RUTA_DETALLE SET ID_COBRADOR = :idEmpleado WHERE ID_RUTA = :id AND ID_DOCUMENTO IS NOT NULL`,
      { idEmpleado: input.idEmpleado, id });
  }

  if (input.radioKm !== undefined && input.radioKm < Number(actual.RADIO_KM)) {
    const paradas = await conn.execute<{ LATITUD: number; LONGITUD: number }>(
      `SELECT LATITUD, LONGITUD FROM CXC_RUTA_DETALLE WHERE ID_RUTA = :id AND ID_DOCUMENTO IS NOT NULL AND LATITUD IS NOT NULL
        ORDER BY ID_RUTA_DETALLE`, { id });
    const [ancla, ...resto] = (paradas.rows ?? []).map((r) => ({ lat: Number(r.LATITUD), lon: Number(r.LONGITUD) }));
    const lejana = ancla ? Math.max(0, ...resto.map((p) => distanciaKm(ancla, p))) : 0;
    if (lejana > input.radioKm) {
      throw new ConflictError(`El radio no puede ser menor a ${lejana.toFixed(1)} km: hay paradas asignadas a esa distancia de la primera.`);
    }
  }
}

export async function remove(id: number): Promise<void> {
  const conn = await getConnection();
  try {
    const ruta=await conn.execute<{ESTADO:string}>('SELECT ESTADO FROM CXC_RUTAS WHERE ID_RUTA=:id FOR UPDATE',{id});
    if(!ruta.rows?.length) throw new NotFoundError('Ruta no encontrada');
    if(['COMPLETADA','CANCELADA'].includes(ruta.rows[0].ESTADO.trim())) throw new ConflictError('Una ruta cerrada conserva su historial');
    const detalle=await conn.execute<{TOTAL:number}>('SELECT COUNT(*) TOTAL FROM CXC_RUTA_DETALLE WHERE ID_RUTA=:id',{id});
    if((detalle.rows?.[0]?.TOTAL ?? 0)>0) throw new ConflictError('La ruta tiene paradas o documentos; cancélala para conservar su historial');
    const result = await conn.execute(`DELETE FROM CXC_RUTAS WHERE ID_RUTA = :id`, { id });
    if (!result.rowsAffected) throw new NotFoundError(`Ruta ${id} no encontrada`);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}
