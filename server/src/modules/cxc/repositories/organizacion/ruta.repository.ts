import oracledb, { type Connection } from 'oracledb';
import { getConnection } from '../../../../config/database';
import {
  distanciaKm,
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
  FECHA_ISO: string | null;
  ESTADO: string;
  OBSERVACIONES: string;
  RADIO_KM: number | null;
  ID_ZONA: number | null;
  NOMBRE_ZONA: string | null;
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
    fecha: row.FECHA_ISO,
    estado: row.ESTADO?.trim(),
    observaciones: row.OBSERVACIONES,
    radioKm: Number(row.RADIO_KM ?? 5),
    idZona: row.ID_ZONA,
    nombreZona: row.NOMBRE_ZONA,
  };
}

// OJO: la tabla de empleados en la base se llama EMPLEADO (no CXC_EMPLEADOS).
// LEFT JOIN (no JOIN normal): un ID_EMPLEADO huérfano no debe hacer
// desaparecer la ruta de los listados ni causar un falso 404 en findById.
const SELECT_BASE = `
  SELECT r.ID_RUTA, r.CODIGO_RUTA, r.NOMBRE, r.ID_EMPLEADO,
         (e.NOMBRE || ' ' || e.APELLIDO) AS NOMBRE_EMPLEADO,
         r.ID_SUCURSAL, s.NOMBRE AS NOMBRE_SUCURSAL,
         TO_CHAR(r.FECHA, 'YYYY-MM-DD') AS FECHA_ISO,
         r.ESTADO, r.OBSERVACIONES, r.RADIO_KM,
         r.ID_ZONA, z.NOMBRE AS NOMBRE_ZONA
  FROM CXC_RUTAS r
  LEFT JOIN EMPLEADO e ON e.ID_EMPLEADO = r.ID_EMPLEADO
  LEFT JOIN CXC_SUCURSALES s ON s.ID_SUCURSAL = r.ID_SUCURSAL
  LEFT JOIN CXC_ZONAS_COBRO z ON z.ID_ZONA = r.ID_ZONA
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
      COMPLETADAS: number; CANCELADAS: number; PROXIMA_ISO: string | null; ULTIMA_ISO: string | null;
    }>(
      `SELECT r.ID_EMPLEADO,
              MAX(e.NOMBRE || ' ' || e.APELLIDO) AS NOMBRE_EMPLEADO,
              COUNT(*) AS TOTAL,
              COUNT(CASE WHEN TRIM(r.ESTADO) = 'PLANIFICADA' THEN 1 END) AS PLANIFICADAS,
              COUNT(CASE WHEN TRIM(r.ESTADO) = 'EN_PROCESO' THEN 1 END) AS EN_PROCESO,
              COUNT(CASE WHEN TRIM(r.ESTADO) = 'COMPLETADA' THEN 1 END) AS COMPLETADAS,
              COUNT(CASE WHEN TRIM(r.ESTADO) = 'CANCELADA' THEN 1 END) AS CANCELADAS,
              TO_CHAR(MIN(CASE WHEN TRIM(r.ESTADO) IN ('PLANIFICADA', 'EN_PROCESO') THEN r.FECHA END), 'YYYY-MM-DD') AS PROXIMA_ISO,
              TO_CHAR(MAX(r.FECHA), 'YYYY-MM-DD') AS ULTIMA_ISO
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
      proximaFecha: row.PROXIMA_ISO,
      ultimaFecha: row.ULTIMA_ISO,
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

/** ORA-30006: otra transacción tiene la tabla bloqueada y se agotó la espera. */
const esEsperaVencida = (err: unknown) => (err as { errorNum?: number })?.errorNum === 30006;

/**
 * Siguiente código de ruta con el formato RUT-001. Igual que pagos, recibos y notas de
 * crédito: bloquea la tabla hasta el commit de quien llama, para que dos altas
 * simultáneas no tomen el mismo número. Debe llamarse antes del INSERT.
 */
async function siguienteCodigoRuta(conn: Connection): Promise<string> {
  try {
    await conn.execute('LOCK TABLE CXC_RUTAS IN EXCLUSIVE MODE WAIT 5');
  } catch (err) {
    if (esEsperaVencida(err)) {
      throw new ConflictError('Otro usuario está registrando una ruta. Intenta de nuevo en unos segundos.');
    }
    throw err;
  }
  const r = await conn.execute<{ ULTIMO: number | null }>(
    // El CASE evita convertir códigos heredados con otro formato.
    `SELECT MAX(CASE WHEN REGEXP_LIKE(CODIGO_RUTA, '^RUT-[0-9]+$') THEN TO_NUMBER(SUBSTR(CODIGO_RUTA, 5)) END) AS ULTIMO
       FROM CXC_RUTAS`,
  );
  return `RUT-${String(Number(r.rows?.[0]?.ULTIMO ?? 0) + 1).padStart(3, '0')}`;
}

export async function create(input: CreateRutaInput): Promise<number> {
  const conn = await getConnection();
  try {
    const codigoRuta = await siguienteCodigoRuta(conn);
    const result = await conn.execute<{ id: number[] }>(
      `INSERT INTO CXC_RUTAS (CODIGO_RUTA, NOMBRE, ID_EMPLEADO, ID_SUCURSAL, FECHA, ESTADO, OBSERVACIONES, RADIO_KM, ID_ZONA)
       VALUES (:codigoRuta, :nombre, :idEmpleado, :idSucursal, TO_DATE(:fecha, 'YYYY-MM-DD'), 'PLANIFICADA', :observaciones, :radioKm, :idZona)
       RETURNING ID_RUTA INTO :id`,
      {
        codigoRuta,
        nombre: input.nombre,
        idEmpleado: input.idEmpleado,
        idSucursal: input.idSucursal,
        fecha: input.fecha,
        radioKm: input.radioKm,
        idZona: input.idZona,
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
  // El estado solamente cambia por las operaciones de cobranza y finalizar().
  if (input.estado !== undefined) {
    throw new ConflictError('El estado de la ruta no se modifica manualmente.');
  }
  if (input.observaciones !== undefined) { fields.push('OBSERVACIONES = :observaciones'); binds.observaciones = input.observaciones ?? ''; }
  if (input.radioKm !== undefined) { fields.push('RADIO_KM = :radioKm'); binds.radioKm = input.radioKm; }
  if (input.idZona !== undefined) { fields.push('ID_ZONA = :idZona'); binds.idZona = input.idZona; }

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
    await validarCambios(conn, id, actual.rows[0], input);
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

/** Paradas con documento, pendientes y cobros confirmados. */
async function resumenParadas(conn: Connection, idRuta: number) {
  const r = await conn.execute<{ TOTAL: number; PENDIENTES: number; COBROS: number }>(
    `SELECT p.TOTAL, p.PENDIENTES,
            (SELECT COUNT(*) FROM CXC_APLICACION_PAGOS ap
              JOIN CXC_RUTA_DETALLE x ON x.ID_RUTA_DETALLE = ap.ID_RUTA_DETALLE
             WHERE x.ID_RUTA = :idRuta AND ap.ESTADO = 'CONFIRMADA') AS COBROS
       FROM (SELECT COUNT(*) AS TOTAL,
                    COUNT(CASE WHEN NVL(d.ESTADO_VISITA, 'PENDIENTE') = 'PENDIENTE' THEN 1 END) AS PENDIENTES
               FROM CXC_RUTA_DETALLE d
              WHERE d.ID_RUTA = :idRuta AND d.ID_DOCUMENTO IS NOT NULL) p`,
    { idRuta },
  );
  return {
    total: Number(r.rows?.[0]?.TOTAL ?? 0),
    pendientes: Number(r.rows?.[0]?.PENDIENTES ?? 0),
    cobros: Number(r.rows?.[0]?.COBROS ?? 0),
  };
}

/**
 * Cierra formalmente una ruta bajo el mismo bloqueo transaccional usado por
 * asignaciones, visitas y cobros (CXC_RUTAS FOR UPDATE).
 *
 * Una parada solo se considera resuelta si está VISITADO y tiene:
 * - una aplicación de pago CONFIRMADA asociada, o
 * - una gestión explícita PAGO_DENEGADO registrada en la bitácora.
 *
 * NO_ENCONTRADO, REPROGRAMADO y PENDIENTE no permiten el cierre. Un registro
 * VISITA por sí solo acredita presencia, no un desenlace de cobranza.
 */
export async function finalizar(id: number): Promise<void> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ ESTADO: string }>(
      `SELECT TRIM(ESTADO) AS ESTADO FROM CXC_RUTAS
        WHERE ID_RUTA = :id FOR UPDATE`,
      { id },
    );
    const ruta = result.rows?.[0];
    if (!ruta) throw new NotFoundError(`Ruta ${id} no encontrada`);
    if (ruta.ESTADO !== 'EN_PROCESO') {
      throw new ConflictError('Solo se puede finalizar una ruta EN_PROCESO.');
    }

    // Se obtienen todas las paradas y sus evidencias bajo el bloqueo de la ruta.
    // La condición de cierre se mantiene: VISITADO + cobro confirmado o PAGO_DENEGADO.
    const paradasResult = await conn.execute<{
      ID_RUTA_DETALLE: number;
      DOCUMENTO: string;
      CLIENTE: string;
      ESTADO_VISITA: string;
      TIENE_COBRO: number;
      TIENE_NEGATIVA: number;
    }>(
      `SELECT d.ID_RUTA_DETALLE,
              TRIM(NVL(doc.SERIE, '') || ' ' || NVL(doc.NUMERO_DOCUMENTO, '')) AS DOCUMENTO,
              c.NOMBRE AS CLIENTE,
              TRIM(NVL(d.ESTADO_VISITA, 'PENDIENTE')) AS ESTADO_VISITA,
              CASE WHEN EXISTS (
                SELECT 1 FROM CXC_APLICACION_PAGOS ap
                WHERE ap.ID_RUTA_DETALLE = d.ID_RUTA_DETALLE
                  AND ap.ESTADO = 'CONFIRMADA'
              ) THEN 1 ELSE 0 END AS TIENE_COBRO,
              CASE WHEN EXISTS (
                SELECT 1 FROM CXC_GESTIONES_COBRO g
                WHERE g.ID_RUTA_DETALLE = d.ID_RUTA_DETALLE
                  AND g.RESULTADO = 'PAGO_DENEGADO'
              ) THEN 1 ELSE 0 END AS TIENE_NEGATIVA
         FROM CXC_RUTA_DETALLE d
         JOIN CXC_DOCUMENTOS doc ON doc.ID_DOCUMENTO = d.ID_DOCUMENTO
         JOIN CLIENTE c ON c.ID_CLIENTE = doc.ID_CLIENTE
        WHERE d.ID_RUTA = :id AND d.ID_DOCUMENTO IS NOT NULL
        ORDER BY d.ORDEN_VISITA NULLS LAST, d.ID_RUTA_DETALLE`,
      { id },
    );

    const paradas = paradasResult.rows ?? [];
    if (paradas.length === 0) {
      throw new ConflictError('No se puede finalizar una ruta sin paradas asignadas.');
    }

    const pendientes = paradas.flatMap((parada) => {
      const estado = parada.ESTADO_VISITA;
      const tieneResultado = Number(parada.TIENE_COBRO) === 1 || Number(parada.TIENE_NEGATIVA) === 1;
      if (estado === 'VISITADO' && tieneResultado) return [];

      let motivo: string;
      switch (estado) {
        case 'PENDIENTE':
          motivo = 'Visita pendiente de realizar';
          break;
        case 'REPROGRAMADO':
          motivo = 'Visita reprogramada sin resolver';
          break;
        case 'NO_ENCONTRADO':
          motivo = 'Cliente no encontrado; requiere seguimiento';
          break;
        case 'VISITADO':
          motivo = 'Visita realizada sin cobro confirmado ni pago denegado';
          break;
        default:
          motivo = `Estado de visita ${estado || 'desconocido'} sin resolver`;
      }

      return [`${parada.DOCUMENTO || `Parada #${parada.ID_RUTA_DETALLE}`} - ${parada.CLIENTE}: ${motivo}`];
    });

    if (pendientes.length > 0) {
      // Se limita la longitud del mensaje para rutas con muchas paradas.
      const maxDetalles = 8;
      const detalles = pendientes.slice(0, maxDetalles).join('; ');
      const restantes = pendientes.length - maxDetalles;
      throw new ConflictError(
        `No se puede finalizar la ruta: ${pendientes.length} parada(s) requieren atención. ${detalles}${restantes > 0 ? `; y ${restantes} más` : ''}.`,
      );
    }

    const actualizado = await conn.execute(
      `UPDATE CXC_RUTAS SET ESTADO = 'COMPLETADA'
        WHERE ID_RUTA = :id AND TRIM(ESTADO) = 'EN_PROCESO'`,
      { id },
    );
    if (actualizado.rowsAffected !== 1) {
      throw new ConflictError('No se pudo finalizar: el estado de la ruta cambió.');
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.close();
  }
}

/**
 * Reglas al editar una ruta abierta:
 * - Estado: solo transiciones válidas; el cierre COMPLETADA se realiza con finalizar().
 * - Responsable: un cobrador por ruta; si cambia, pasa a todas sus paradas, salvo que ya haya cobros.
 * - Radio: no puede dejar fuera paradas que ya están asignadas.
 */
async function validarCambios(
  conn: Connection, id: number,
  actual: { ID_EMPLEADO: number; RADIO_KM: number }, input: UpdateRutaInput,
) {

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
