import oracledb, { type Connection } from 'oracledb';
import { getConnection } from '../../../../config/database';
import {
  TRANSICIONES_RUTA, distanciaKm,
  type Ruta, type RutasPorEmpleado, type CreateRutaInput, type UpdateRutaInput, type SugerenciaSucursalRuta,
} from '@erp/contracts';
import { AppError, NotFoundError, ConflictError } from '../../../../shared/errors/AppError';

interface RutaRow {
  ID_RUTA: number;
  CODIGO_RUTA: string | null;
  NOMBRE: string;
  ID_EMPLEADO: number;
  NOMBRE_EMPLEADO: string | null;
  ID_SUCURSAL: number | null;
  NOMBRE_SUCURSAL: string | null;
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
    idSucursal: row.ID_SUCURSAL,
    nombreSucursal: row.NOMBRE_SUCURSAL,
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
         r.ID_SUCURSAL, s.NOMBRE AS NOMBRE_SUCURSAL,
         r.FECHA, r.ESTADO, r.OBSERVACIONES, r.RADIO_KM
  FROM CXC_RUTAS r
  LEFT JOIN EMPLEADO e ON e.ID_EMPLEADO = r.ID_EMPLEADO
  LEFT JOIN CXC_SUCURSALES s ON s.ID_SUCURSAL = r.ID_SUCURSAL
`;

/** Búsqueda por nombre o código de ruta, estado o nombre del empleado; filtro opcional por empleado. */
function filtroRutas(params: { search?: string; idEmpleado?: number; idSucursal?: number; fecha?: string; excluirId?: number }) {
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
  if (params.idSucursal) {
    condiciones.push('r.ID_SUCURSAL = :idSucursal');
    binds.idSucursal = params.idSucursal;
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
  idSucursal?: number;
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
export async function resumenPorEmpleado(params: { search?: string; idSucursal?: number }): Promise<RutasPorEmpleado[]> {
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

/** Siguiente código de ruta libre con el formato RUT-001 (el índice único protege contra repetidos). */
async function siguienteCodigoRuta(conn: Connection): Promise<string> {
  const r = await conn.execute<{ C: string }>(`SELECT CODIGO_RUTA AS C FROM CXC_RUTAS WHERE REGEXP_LIKE(CODIGO_RUTA, '^RUT-[0-9]+$')`);
  const max = (r.rows ?? []).reduce((m, x) => Math.max(m, Number(x.C.slice(4))), 0);
  return `RUT-${String(max + 1).padStart(3, '0')}`;
}

/** ORA-00001 sobre el código de ruta: otra ruta tomó el mismo número entre el cálculo y el guardado. */
const esCodigoRutaRepetido = (err: unknown) =>
  (err as { errorNum?: number })?.errorNum === 1 && String((err as Error).message).includes('UX_CXC_RUTAS_CODIGO');

export async function create(input: CreateRutaInput): Promise<number> {
  const conn = await getConnection();
  try {
    for (let intento = 1; ; intento++) {
      try {
        const result = await conn.execute<{ id: number[] }>(
          `INSERT INTO CXC_RUTAS (CODIGO_RUTA, NOMBRE, ID_EMPLEADO, ID_SUCURSAL, FECHA, ESTADO, OBSERVACIONES, RADIO_KM)
           VALUES (:codigoRuta, :nombre, :idEmpleado, :idSucursal, TO_DATE(:fecha, 'YYYY-MM-DD'), 'PLANIFICADA', :observaciones, :radioKm)
           RETURNING ID_RUTA INTO :id`,
          {
            codigoRuta: await siguienteCodigoRuta(conn),
            nombre: input.nombre,
            idEmpleado: input.idEmpleado,
            idSucursal: input.idSucursal,
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
        if (esCodigoRutaRepetido(err) && intento < 3) { await conn.rollback(); continue; }
        throw err;
      }
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

/**
 * Regla de sucursal: la sucursal debe existir y estar activa, y el empleado responsable
 * debe pertenecer a esa misma sucursal (un empleado solo tiene rutas de su sucursal).
 */
export async function validarSucursalYEmpleado(idSucursal: number, idEmpleado: number): Promise<void> {
  const campo = (c: string, m: string) => new AppError(m, 400, 'BAD_REQUEST', true, [{ campo: c, mensaje: m }]);
  const conn = await getConnection();
  try {
    const suc = await conn.execute<{ ESTADO: string }>('SELECT ESTADO FROM CXC_SUCURSALES WHERE ID_SUCURSAL = :id', { id: idSucursal });
    if (!suc.rows?.length) throw campo('idSucursal', 'La sucursal seleccionada no existe.');
    if (String(suc.rows[0].ESTADO).trim() !== 'A') throw campo('idSucursal', 'La sucursal seleccionada está inactiva.');

    const emp = await conn.execute<{ ID_SUCURSAL: number | null; NOMBRE: string }>(
      `SELECT ID_SUCURSAL, TRIM(NOMBRE || ' ' || NVL(APELLIDO, '')) AS NOMBRE FROM EMPLEADO WHERE ID_EMPLEADO = :id`, { id: idEmpleado });
    if (!emp.rows?.length) throw campo('idEmpleado', 'El empleado seleccionado no existe.');
    const { ID_SUCURSAL, NOMBRE } = emp.rows[0];
    if (!ID_SUCURSAL) {
      throw campo('idEmpleado', `${NOMBRE} no tiene una sucursal asignada. Asígnala en Usuarios y accesos → Empleados antes de darle rutas.`);
    }
    if (Number(ID_SUCURSAL) !== idSucursal) {
      throw campo('idEmpleado', `${NOMBRE} pertenece a otra sucursal: solo puede tener rutas de su propia sucursal.`);
    }
  } finally {
    await conn.close();
  }
}

/** Sucursal activa más cercana (línea recta) a la primera parada con ubicación de la ruta. Solo es una sugerencia. */
export async function sucursalMasCercana(idRuta: number): Promise<SugerenciaSucursalRuta> {
  const conn = await getConnection();
  try {
    const parada = await conn.execute<{ LATITUD: number; LONGITUD: number }>(
      `SELECT LATITUD, LONGITUD FROM CXC_RUTA_DETALLE WHERE ID_RUTA = :idRuta AND LATITUD IS NOT NULL AND LONGITUD IS NOT NULL
        ORDER BY ID_RUTA_DETALLE FETCH FIRST 1 ROWS ONLY`, { idRuta });
    if (!parada.rows?.length) return { sugerida: null, motivo: 'La ruta aún no tiene paradas con ubicación.' };

    const sucursales = await conn.execute<{ ID_SUCURSAL: number; NOMBRE: string; LATITUD: number; LONGITUD: number }>(
      `SELECT ID_SUCURSAL, NOMBRE, LATITUD, LONGITUD FROM CXC_SUCURSALES
        WHERE ESTADO = 'A' AND LATITUD IS NOT NULL AND LONGITUD IS NOT NULL`);
    if (!sucursales.rows?.length) return { sugerida: null, motivo: 'Ninguna sucursal activa tiene ubicación registrada.' };

    const origen = { lat: Number(parada.rows[0].LATITUD), lon: Number(parada.rows[0].LONGITUD) };
    const mejor = sucursales.rows
      .map((x) => ({ idSucursal: x.ID_SUCURSAL, nombre: x.NOMBRE, distanciaKm: distanciaKm(origen, { lat: Number(x.LATITUD), lon: Number(x.LONGITUD) }) }))
      .sort((a, b) => a.distanciaKm - b.distanciaKm)[0];
    return { sugerida: { ...mejor, distanciaKm: Math.round(mejor.distanciaKm * 10) / 10 }, motivo: null };
  } finally {
    await conn.close();
  }
}

export async function update(id: number, input: UpdateRutaInput): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, any> = { id };

  if (input.nombre !== undefined) { fields.push('NOMBRE = :nombre'); binds.nombre = input.nombre; }
  if (input.idEmpleado !== undefined) { fields.push('ID_EMPLEADO = :idEmpleado'); binds.idEmpleado = input.idEmpleado; }
  if (input.idSucursal !== undefined) { fields.push('ID_SUCURSAL = :idSucursal'); binds.idSucursal = input.idSucursal; }
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
