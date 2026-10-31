import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import { AppError, BadRequestError, NotFoundError, ConflictError } from '../../../../shared/errors/AppError';
import { isDocumentoBloqueadoParaAplicacion, roundMoney } from '../../shared/financialRules';
import { EN_ZONA_SQL } from './zonaCobro.repository';
import { businessNowHHMM, businessTodayIso } from '../../../../shared/date';
import {
  REGLAS_RUTA, JORNADA_COBRADOR, choqueDeHorario, distanciaKm, esDiaDeVisita, esHoraDeVisita, mensajeDiaDescanso, primeraHoraLibre, NOMBRE_DIAS, diaSemana,
  type AsignarDocumentoRuta, type RegistrarBitacoraRuta, type PerfilCobradorInput, type RutaAsignacion, type RutaBitacora,
  type CobradorPerfil, type RutaOperacion, type RutaDocumentoPendiente, type RutaPagoDisponible, type RutaPlanificacion,
} from '@erp/contracts';

type Conn = Awaited<ReturnType<typeof getConnection>>;
export interface RutaBloqueada { ESTADO: string; FECHA: string | null; ID_EMPLEADO: number; RADIO_KM: number }

/** Bloquea la ruta (FOR UPDATE), exige que esté abierta y devuelve sus datos de planificación. */
export async function lockRuta(conn: Conn, idRuta: number): Promise<RutaBloqueada> {
  const result = await conn.execute<RutaBloqueada>(
    `SELECT TRIM(ESTADO) ESTADO, TO_CHAR(FECHA,'YYYY-MM-DD') FECHA, ID_EMPLEADO, RADIO_KM FROM CXC_RUTAS WHERE ID_RUTA=:idRuta FOR UPDATE`, {idRuta});
  if (!result.rows?.length) throw new NotFoundError('Ruta no encontrada');
  if (!['PLANIFICADA','EN_PROCESO'].includes(result.rows[0].ESTADO)) throw new ConflictError('La ruta no está abierta');
  return result.rows[0];
}

/** La primera visita o el primer cobro ponen la ruta EN_PROCESO. */
export async function iniciarRuta(conn: Conn, idRuta: number) {
  await conn.execute(`UPDATE CXC_RUTAS SET ESTADO='EN_PROCESO' WHERE ID_RUTA=:idRuta AND TRIM(ESTADO)='PLANIFICADA'`, {idRuta});
}

const fechaLegible = (iso: string) => `${NOMBRE_DIAS[diaSemana(iso)]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Reordena las paradas con documento según su hora programada (1, 2, 3…). */
async function renumerarParadas(conn: Conn, idRuta: number) {
  await conn.execute(`MERGE INTO CXC_RUTA_DETALLE t
    USING (SELECT ID_RUTA_DETALLE, ROW_NUMBER() OVER (ORDER BY HORA_PROGRAMADA NULLS LAST, ID_RUTA_DETALLE) RN
             FROM CXC_RUTA_DETALLE WHERE ID_RUTA=:idRuta AND ID_DOCUMENTO IS NOT NULL) s
       ON (t.ID_RUTA_DETALLE = s.ID_RUTA_DETALLE)
     WHEN MATCHED THEN UPDATE SET t.ORDEN_VISITA = s.RN`, {idRuta});
}
const confirmado = `(SELECT NVL(SUM(ap.MONTO_APLICADO),0) FROM CXC_APLICACION_PAGOS ap WHERE ap.ID_RUTA_DETALLE=a.ID_RUTA_DETALLE AND ap.ESTADO='CONFIRMADA')`;
const reservado = `(SELECT NVL(SUM(GREATEST(a.MONTO_ASIGNADO-${confirmado},0)),0) FROM CXC_RUTA_DETALLE a JOIN CXC_RUTAS r ON r.ID_RUTA=a.ID_RUTA WHERE a.ID_DOCUMENTO=d.ID_DOCUMENTO AND r.ESTADO IN ('PLANIFICADA','EN_PROCESO'))`;
export async function resumen(idRuta: number): Promise<RutaOperacion> {
  const conn = await getConnection();
  try {
    const ruta = await conn.execute<Omit<RutaPlanificacion, 'ANCLA' | 'ZONA'> & { ID_ZONA: number | null; NOMBRE_ZONA: string | null }>(`SELECT r.ID_RUTA, r.ID_EMPLEADO, TRIM(e.NOMBRE || ' ' || e.APELLIDO) RESPONSABLE,
      TO_CHAR(r.FECHA,'YYYY-MM-DD') FECHA, TRIM(r.ESTADO) ESTADO, r.RADIO_KM, r.ID_ZONA, z.NOMBRE NOMBRE_ZONA
      FROM CXC_RUTAS r LEFT JOIN EMPLEADO e ON e.ID_EMPLEADO=r.ID_EMPLEADO LEFT JOIN CXC_ZONAS_COBRO z ON z.ID_ZONA=r.ID_ZONA
      WHERE r.ID_RUTA=:idRuta`, {idRuta});
    if (!ruta.rows?.length) throw new NotFoundError('Ruta no encontrada');
    const a = await conn.execute<RutaAsignacion>(`SELECT a.ID_RUTA_DETALLE ID_ASIGNACION,a.ID_DOCUMENTO,a.ID_CLIENTE,
      a.ID_COBRADOR ID_EMPLEADO,a.MONTO_ASIGNADO,${confirmado} MONTO_REGISTRADO,a.DIRECCION,a.LATITUD,a.LONGITUD,a.ORDEN_VISITA,a.ESTADO_VISITA,a.HORA_PROGRAMADA,a.HORA_VISITA,
      d.SALDO SALDO_DOCUMENTO,TRIM(d.SERIE || ' ' || d.NUMERO_DOCUMENTO) DOCUMENTO,d.ID_MONEDA,m.CODIGO MONEDA,c.NOMBRE CLIENTE,
      TRIM(e.NOMBRE || ' ' || e.APELLIDO) COBRADOR
      FROM CXC_RUTA_DETALLE a JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO=a.ID_DOCUMENTO
      JOIN CLIENTE c ON c.ID_CLIENTE=d.ID_CLIENTE JOIN EMPLEADO e ON e.ID_EMPLEADO=a.ID_COBRADOR
      JOIN MONEDA m ON m.ID_MONEDA=d.ID_MONEDA WHERE a.ID_RUTA=:idRuta ORDER BY a.ORDEN_VISITA NULLS LAST,a.ID_RUTA_DETALLE`, {idRuta});
    const b = await conn.execute<RutaBitacora>(`SELECT * FROM (
      SELECT g.ID_GESTION ID_BITACORA,g.ID_RUTA_DETALLE ID_ASIGNACION,g.TIPO_GESTION TIPO,CAST(NULL AS NUMBER) MONTO,
      g.RESULTADO || ': ' || g.OBSERVACION OBSERVACIONES,CAST(NULL AS VARCHAR2(80)) REFERENCIA,
      TO_CHAR(g.FECHA_GESTION,'YYYY-MM-DD HH24:MI:SS') FECHA,TRIM(e.NOMBRE || ' ' || e.APELLIDO) COBRADOR,
      TRIM(d.SERIE || ' ' || d.NUMERO_DOCUMENTO) DOCUMENTO,CAST(NULL AS VARCHAR2(20)) ESTADO,m.CODIGO MONEDA,
      TRIM(e.NOMBRE || ' ' || e.APELLIDO) REGISTRADO_POR
      FROM CXC_GESTIONES_COBRO g JOIN CXC_RUTA_DETALLE a ON a.ID_RUTA_DETALLE=g.ID_RUTA_DETALLE
      JOIN EMPLEADO e ON e.ID_EMPLEADO=g.ID_EMPLEADO JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO=a.ID_DOCUMENTO
      JOIN MONEDA m ON m.ID_MONEDA=d.ID_MONEDA WHERE a.ID_RUTA=:idRuta
      UNION ALL
      SELECT ap.ID_APLICACION,ap.ID_RUTA_DETALLE,'COBRO',ap.MONTO_APLICADO,
      'Pago aplicado. ' || CASE WHEN ap.ESTADO='REVERSADA' THEN 'Reversado: ' || ap.MOTIVO_REVERSA ELSE 'Confirmado' END,
      p.NUMERO_REFERENCIA,TO_CHAR(ap.FECHA_APLICACION,'YYYY-MM-DD HH24:MI:SS'),TRIM(e.NOMBRE || ' ' || e.APELLIDO),
      TRIM(d.SERIE || ' ' || d.NUMERO_DOCUMENTO),ap.ESTADO,m.CODIGO,TRIM(er.NOMBRE || ' ' || er.APELLIDO)
      FROM CXC_APLICACION_PAGOS ap JOIN CXC_RUTA_DETALLE a ON a.ID_RUTA_DETALLE=ap.ID_RUTA_DETALLE
      JOIN CXC_PAGOS p ON p.ID_PAGO=ap.ID_PAGO JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO=ap.ID_DOCUMENTO
      JOIN EMPLEADO e ON e.ID_EMPLEADO=a.ID_COBRADOR LEFT JOIN EMPLEADO er ON er.ID_EMPLEADO=ap.ID_EMPLEADO
      JOIN MONEDA m ON m.ID_MONEDA=d.ID_MONEDA WHERE a.ID_RUTA=:idRuta
    ) ORDER BY FECHA DESC,ID_BITACORA DESC`, {idRuta});
    const p = await conn.execute<CobradorPerfil>(`SELECT e.ID_EMPLEADO,TRIM(e.NOMBRE || ' ' || e.APELLIDO) NOMBRE,e.TELEFONO,e.PUESTO,e.EMAIL,e.FOTO_URL
      FROM EMPLEADO e WHERE e.ID_EMPLEADO IN
      (SELECT ID_COBRADOR FROM CXC_RUTA_DETALLE WHERE ID_RUTA=:idRuta UNION SELECT ID_EMPLEADO FROM CXC_RUTAS WHERE ID_RUTA=:idRuta)`, {idRuta});
    const asignaciones = a.rows ?? [];
    const primera = [...asignaciones].sort((x, y) => x.ID_ASIGNACION - y.ID_ASIGNACION).find((x) => x.LATITUD != null && x.LONGITUD != null);
    const { ID_ZONA, NOMBRE_ZONA, ...datosRuta } = ruta.rows[0];
    const planificacion: RutaPlanificacion = {
      ...datosRuta,
      RADIO_KM: Number(datosRuta.RADIO_KM ?? REGLAS_RUTA.radioKmDefecto),
      ZONA: ID_ZONA ? { ID_ZONA, NOMBRE: NOMBRE_ZONA ?? '' } : null,
      ANCLA: primera ? { ID_ASIGNACION: primera.ID_ASIGNACION, LATITUD: primera.LATITUD, LONGITUD: primera.LONGITUD, CLIENTE: primera.CLIENTE } : null,
    };
    return {ruta:planificacion,asignaciones,bitacora:b.rows ?? [],cobradores:p.rows ?? []};
  } finally { await conn.close(); }
}
/**
 * Documento de cobro que todavía puede visitarse en la ruta. Fuera quedan:
 * - los que cubre un convenio ACTIVO (se cobran por cuotas);
 * - los que tienen una promesa de pago vigente que vence el día de la ruta o después
 *   (no se visita antes de lo prometido);
 * - los que ya están en esta ruta.
 * EN_ZONA dice si el cliente pertenece a la zona de la ruta (ver EN_ZONA_SQL).
 */
const SELECT_DOCUMENTOS_RUTA = `SELECT d.ID_DOCUMENTO,TRIM(d.SERIE || ' ' || d.NUMERO_DOCUMENTO) DOCUMENTO,
    d.SALDO,GREATEST(d.SALDO-${reservado},0) DISPONIBLE,d.ID_MONEDA,m.CODIGO MONEDA,c.NOMBRE CLIENTE,
    c.DIRECCION DIRECCION_CLIENTE,'CR-' || LPAD(c.ID_CLIENTE,5,'0') CODIGO_COBRO,c.ID_CLIENTE,
    cz.NOMBRE ZONA_CLIENTE,${EN_ZONA_SQL} EN_ZONA,
    TO_DATE(:hoy,'YYYY-MM-DD') - TRUNC(d.FECHA_VENCIMIENTO) DIAS_VENCIDO,
    u.LATITUD LATITUD_CLIENTE,u.LONGITUD LONGITUD_CLIENTE
    FROM CXC_DOCUMENTOS d JOIN CLIENTE c ON c.ID_CLIENTE=d.ID_CLIENTE JOIN MONEDA m ON m.ID_MONEDA=d.ID_MONEDA
    JOIN CXC_RUTAS r ON r.ID_RUTA=:idRuta
    LEFT JOIN CXC_ZONAS_COBRO rz ON rz.ID_ZONA=r.ID_ZONA
    LEFT JOIN CXC_CLIENTE_UBICACION u ON u.ID_CLIENTE=c.ID_CLIENTE
    LEFT JOIN CXC_ZONAS_COBRO cz ON cz.ID_ZONA=u.ID_ZONA
    WHERE d.SALDO>0 AND TRIM(d.ESTADO) NOT IN ('ANULADO','ANULADA','PAGADO','PAGADA')
      AND NOT EXISTS (SELECT 1 FROM CXC_CONVENIO_DOCUMENTOS cvd JOIN CXC_CONVENIOS_PAGO cv ON cv.ID_CONVENIO=cvd.ID_CONVENIO
                       WHERE cvd.ID_DOCUMENTO=d.ID_DOCUMENTO AND UPPER(TRIM(cv.ESTADO))='ACTIVO')
      AND NOT EXISTS (SELECT 1 FROM CXC_PROMESAS_PAGO pp
                       WHERE pp.ID_CLIENTE=d.ID_CLIENTE AND UPPER(TRIM(pp.ESTADO))='PENDIENTE'
                         AND (pp.ID_DOCUMENTO=d.ID_DOCUMENTO OR pp.ID_DOCUMENTO IS NULL)
                         AND pp.FECHA_COMPROMISO >= NVL(TRUNC(r.FECHA), TO_DATE(:hoy,'YYYY-MM-DD')))
      AND NOT EXISTS (SELECT 1 FROM CXC_RUTA_DETALLE x WHERE x.ID_RUTA=r.ID_RUTA AND x.ID_DOCUMENTO=d.ID_DOCUMENTO)`;

/**
 * Documentos para asignar a la ruta: por defecto solo los de clientes de su zona;
 * con fueraZona también los demás (marcados EN_ZONA = 0). Orden de cobro: primero
 * los de la zona, luego más días vencidos y mayor saldo.
 */
export async function pendientes(idRuta: number, opciones: { fueraZona?: boolean } = {}) {
  const conn = await getConnection();
  try {
    const r = await conn.execute<RutaDocumentoPendiente>(
      `SELECT * FROM (${SELECT_DOCUMENTOS_RUTA}) WHERE (:fueraZona = 1 OR EN_ZONA = 1) AND DISPONIBLE > 0
        ORDER BY EN_ZONA DESC, DIAS_VENCIDO DESC, SALDO DESC`,
      { idRuta, hoy: businessTodayIso(), fueraZona: opciones.fueraZona ? 1 : 0 },
    );
    return (r.rows ?? []).map((x) => ({ ...x, EN_ZONA: Number(x.EN_ZONA), DIAS_VENCIDO: Number(x.DIAS_VENCIDO) }));
  } finally {await conn.close();}
}
export async function pagosDisponibles() {
  const conn=await getConnection();
  try {return (await conn.execute<RutaPagoDisponible>(`SELECT * FROM (
    SELECT p.ID_PAGO,p.ID_CLIENTE,p.ID_MONEDA,NVL(p.NUMERO_REFERENCIA,'Pago #' || p.ID_PAGO) REFERENCIA,
    p.MONTO-NVL((SELECT SUM(ap.MONTO_APLICADO) FROM CXC_APLICACION_PAGOS ap WHERE ap.ID_PAGO=p.ID_PAGO AND ap.ESTADO='CONFIRMADA'),0) DISPONIBLE,
    c.NOMBRE CLIENTE,m.CODIGO MONEDA FROM CXC_PAGOS p JOIN CLIENTE c ON c.ID_CLIENTE=p.ID_CLIENTE JOIN MONEDA m ON m.ID_MONEDA=p.ID_MONEDA
    WHERE TRIM(p.ESTADO) NOT IN ('ANULADO','REVERSADO') AND NOT EXISTS
    (SELECT 1 FROM CXC_ANTICIPOS ant WHERE ant.ID_PAGO=p.ID_PAGO AND ant.ESTADO <> 'CANCELADO')
  ) WHERE DISPONIBLE>0 ORDER BY ID_PAGO DESC`)).rows ?? [];} finally {await conn.close();}
}
export async function asignar(idRuta: number, input: AsignarDocumentoRuta) {
  const conn = await getConnection();
  try {
    const ruta = await lockRuta(conn,idRuta);
    await validarPlanificacion(conn, idRuta, ruta, input);
    const doc = await conn.execute<{ID_CLIENTE:number;SALDO:number;ESTADO:string}>('SELECT ID_CLIENTE,SALDO,ESTADO FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO=:id FOR UPDATE',{id:input.idDocumento});
    if (!doc.rows?.length) throw new NotFoundError('Documento no encontrado');
    const d=doc.rows[0];
    if (isDocumentoBloqueadoParaAplicacion(d.ESTADO) || d.SALDO<=0) throw new BadRequestError('El documento no está pendiente de cobro');
    const elegible = await conn.execute<{EN_ZONA:number;ZONA_CLIENTE:string|null}>(
      `SELECT EN_ZONA, ZONA_CLIENTE FROM (${SELECT_DOCUMENTOS_RUTA} AND d.ID_DOCUMENTO=:idDocumento)`,
      {idRuta, hoy: businessTodayIso(), idDocumento: input.idDocumento});
    const e = elegible.rows?.[0];
    if (!e) throw new ConflictError('Este documento no se puede visitar en la ruta: ya está en ella, lo cubre un convenio activo o tiene una promesa de pago vigente para esa fecha.');
    const fueraZona = Number(e.EN_ZONA) !== 1;
    if (fueraZona && !input.fueraZona) {
      throw campo('idDocumento', `El cliente no pertenece a la zona de la ruta (${e.ZONA_CLIENTE ? `está en ${e.ZONA_CLIENTE}` : 'no tiene zona registrada'}). Para asignarlo igual, marca «fuera de la zona» e indica el motivo.`);
    }
    const exists=await conn.execute('SELECT ID_RUTA_DETALLE FROM CXC_RUTA_DETALLE WHERE ID_RUTA=:idRuta AND ID_DOCUMENTO=:idDocumento',{idRuta,idDocumento:input.idDocumento});
    if(exists.rows?.length) throw new ConflictError('Este documento ya está asignado a la ruta');
    const reservadoResult=await conn.execute<{RESERVADO:number}>(`SELECT ${reservado} RESERVADO FROM CXC_DOCUMENTOS d WHERE d.ID_DOCUMENTO=:id`,{id:input.idDocumento});
    if(roundMoney(input.montoAsignado+(reservadoResult.rows?.[0]?.RESERVADO ?? 0))>roundMoney(d.SALDO)) throw new ConflictError('El monto supera el saldo disponible para asignar');
    // Un cobrador por ruta: la parada siempre queda a cargo del responsable de la ruta.
    const idCobrador = ruta.ID_EMPLEADO;
    const result=await conn.execute<{id:number[]}>(`INSERT INTO CXC_RUTA_DETALLE
      (ID_RUTA,ID_CLIENTE,ID_DOCUMENTO,ID_COBRADOR,MONTO_ASIGNADO,MONTO_PENDIENTE,DIRECCION,LATITUD,LONGITUD,ORDEN_VISITA,ESTADO_VISITA,HORA_PROGRAMADA)
      VALUES(:idRuta,:idCliente,:idDocumento,:idCobrador,:montoAsignado,:saldo,:direccion,:latitud,:longitud,1,'PENDIENTE',:horaProgramada)
      RETURNING ID_RUTA_DETALLE INTO :id`,{idRuta,idCliente:d.ID_CLIENTE,idDocumento:input.idDocumento,idCobrador,montoAsignado:input.montoAsignado,
        saldo:d.SALDO,direccion:input.direccion,latitud:input.latitud,longitud:input.longitud,horaProgramada:input.horaProgramada,
        id:{dir:oracledb.BIND_OUT,type:oracledb.NUMBER}});
    await renumerarParadas(conn, idRuta);
    await conn.execute(`INSERT INTO CXC_GESTIONES_COBRO(ID_CLIENTE,ID_DOCUMENTO,ID_EMPLEADO,FECHA_GESTION,TIPO_GESTION,RESULTADO,OBSERVACION,ID_RUTA_DETALLE)
      VALUES(:idCliente,:idDocumento,:idEmpleado,SYSDATE,'OTRO','ASIGNACION',:texto,:idDetalle)`,
      {idCliente:d.ID_CLIENTE,idDocumento:input.idDocumento,idEmpleado:idCobrador,
        texto:`Documento asignado a ruta; monto ${input.montoAsignado}; visita programada ${input.horaProgramada}${fueraZona ? `; FUERA DE ZONA: ${input.motivoFueraZona}` : ''}`.slice(0, 500),idDetalle:result.outBinds!.id[0]});
    // El punto confirmado en el mapa queda como ubicación del cliente si aún no tenía una.
    await conn.execute(`MERGE INTO CXC_CLIENTE_UBICACION u
      USING (SELECT :idCliente ID_CLIENTE, :latitud LATITUD, :longitud LONGITUD FROM DUAL) n ON (u.ID_CLIENTE=n.ID_CLIENTE)
      WHEN MATCHED THEN UPDATE SET u.LATITUD=n.LATITUD, u.LONGITUD=n.LONGITUD, u.FECHA_ACTUALIZACION=SYSDATE WHERE u.LATITUD IS NULL
      WHEN NOT MATCHED THEN INSERT (ID_CLIENTE, LATITUD, LONGITUD, CONFIRMADA) VALUES (n.ID_CLIENTE, n.LATITUD, n.LONGITUD, 'N')`,
      {idCliente:d.ID_CLIENTE,latitud:input.latitud,longitud:input.longitud});
    await conn.commit();
  } catch(e) {await conn.rollback();throw e;} finally {await conn.close();}
}
/**
 * Registra una gestion operativa sin crear movimientos financieros.
 * PAGO_DENEGADO queda identificado en RESULTADO y se marca como
 * VISITADO porque el contacto existio. El cierre de la ruta debera
 * evaluar tambien el ultimo resultado de la bitacora.
 */
export async function registrar(idRuta: number, input: RegistrarBitacoraRuta) {
  const conn = await getConnection();
  try {
    const ruta = await lockRuta(conn, idRuta);
    const hoy = businessTodayIso();

    if (ruta.FECHA && ruta.FECHA > hoy) {
      throw new ConflictError(
        `La ruta está planificada para el ${fechaLegible(ruta.FECHA)}; las visitas se registran a partir de ese día.`,
      );
    }

    // Proteccion tambien para llamadas directas al repositorio.
    const tiposPermitidos = [
      'VISITA',
      'NO_ENCONTRADO',
      'PAGO_DENEGADO',
      'INCIDENCIA',
      'REPROGRAMACION',
    ] as const;

    if (!tiposPermitidos.some((tipo) => tipo === input.tipo)) {
      throw new BadRequestError('Tipo de actividad no permitido.');
    }

    if (!input.observaciones?.trim()) {
      throw campo('observaciones', 'Las observaciones son obligatorias.');
    }

    if (input.tipo === 'REPROGRAMACION') {
      if (!input.nuevaFecha) {
        throw campo('nuevaFecha', 'Indica la nueva fecha de la visita.');
      }
      if (input.nuevaFecha <= hoy) {
        throw new BadRequestError('La nueva fecha de visita debe ser posterior a hoy.');
      }
      if (!esDiaDeVisita(input.nuevaFecha)) {
        throw new BadRequestError(mensajeDiaDescanso(input.nuevaFecha));
      }
    }

    // Bloquear la parada antes de registrar la gestion y modificar su estado.
    const a = await conn.execute<{
      ID_CLIENTE: number;
      ID_DOCUMENTO: number;
      ID_COBRADOR: number;
    }>(
      `SELECT ID_CLIENTE, ID_DOCUMENTO, ID_COBRADOR
       FROM CXC_RUTA_DETALLE
       WHERE ID_RUTA_DETALLE = :id
         AND ID_RUTA = :idRuta
         AND ID_DOCUMENTO IS NOT NULL
       FOR UPDATE`,
      { id: input.idAsignacion, idRuta },
    );

    const row = a.rows?.[0];
    if (!row) {
      throw new NotFoundError('La asignación no pertenece a esta ruta');
    }

    // TIPO_GESTION mantiene las categorias ya empleadas por el ERP.
    // El resultado preciso (incluido PAGO_DENEGADO) se registra en RESULTADO.
    const tipoGestion = [
      'VISITA',
      'NO_ENCONTRADO',
      'PAGO_DENEGADO',
    ].includes(input.tipo) ? 'VISITA' : 'OTRO';

    await conn.execute(
      `INSERT INTO CXC_GESTIONES_COBRO (
         ID_CLIENTE, ID_DOCUMENTO, ID_EMPLEADO,
         FECHA_GESTION, TIPO_GESTION, RESULTADO,
         OBSERVACION, ID_RUTA_DETALLE, FECHA_COMPROMISO
       ) VALUES (
         :cliente, :documento, :empleado,
         SYSDATE, :tipo, :resultado,
         :observaciones, :detalle,
         TO_DATE(:nuevaFecha, 'YYYY-MM-DD')
       )`,
      {
        cliente: row.ID_CLIENTE,
        documento: row.ID_DOCUMENTO,
        empleado: row.ID_COBRADOR,
        tipo: tipoGestion,
        resultado: input.tipo,
        observaciones: input.observaciones.trim(),
        detalle: input.idAsignacion,
        nuevaFecha: input.tipo === 'REPROGRAMACION'
          ? input.nuevaFecha ?? null
          : null,
      },
    );

    // PAGO_DENEGADO significa visita efectuada, NO pago realizado.
    // Se reutiliza VISITADO para evitar introducir valores nuevos en
    // ESTADO_VISITA sin verificar las restricciones de Oracle.
    // El detalle de la negativa permanece en la bitacora.
    const estadosVisita: Record<RegistrarBitacoraRuta['tipo'], string | null> = {
      VISITA: 'VISITADO',
      NO_ENCONTRADO: 'NO_ENCONTRADO',
      PAGO_DENEGADO: 'VISITADO',
      REPROGRAMACION: 'REPROGRAMADO',
      INCIDENCIA: null,
    };

    const estadoVisita = estadosVisita[input.tipo];
    if (estadoVisita) {
      await conn.execute(
        `UPDATE CXC_RUTA_DETALLE
         SET ESTADO_VISITA = :estado,
             HORA_VISITA = :hora
         WHERE ID_RUTA_DETALLE = :id`,
        {
          estado: estadoVisita,
          hora: input.tipo === 'REPROGRAMACION' ? null : businessNowHHMM(),
          id: input.idAsignacion,
        },
      );
    }

    // Una incidencia por si sola no inicia la ruta.
    // Un rechazo de pago si implica una visita realizada.
    if (input.tipo !== 'INCIDENCIA') {
      await iniciarRuta(conn, idRuta);
    }

    // No se crean aplicaciones de pago, recibos ni ajustes de saldo.
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    await conn.close();
  }
}

export async function perfil(idEmpleado:number,input:PerfilCobradorInput) {
  const conn=await getConnection();
  try {const result=await conn.execute('UPDATE EMPLEADO SET TELEFONO=:telefono,FOTO_URL=:fotoUrl WHERE ID_EMPLEADO=:idEmpleado',{idEmpleado,...input});
    if(!result.rowsAffected) throw new NotFoundError('Empleado no encontrado');await conn.commit();
  } catch(e){await conn.rollback();throw e;} finally {await conn.close();}
}
export async function documentoAsignado(idRuta:number,idDetalle:number) {
  const conn=await getConnection();try {
    const res=await conn.execute<{ID_DOCUMENTO:number;FECHA_RUTA:string|null}>(`SELECT d.ID_DOCUMENTO, TO_CHAR(r.FECHA,'YYYY-MM-DD') FECHA_RUTA
      FROM CXC_RUTA_DETALLE d JOIN CXC_RUTAS r ON r.ID_RUTA=d.ID_RUTA
      WHERE d.ID_RUTA=:idRuta AND d.ID_RUTA_DETALLE=:idDetalle AND d.ID_DOCUMENTO IS NOT NULL`,{idRuta,idDetalle});
    if(!res.rows?.length) throw new NotFoundError('Asignación no encontrada en esta ruta');
    return { idDocumento: res.rows[0].ID_DOCUMENTO, fechaRuta: res.rows[0].FECHA_RUTA };
  } finally {await conn.close();}
}

/**
 * Reglas de planificación de una parada nueva:
 * - La ruta no puede tener fecha pasada (hay que moverla antes de agregar paradas).
 * - Hora dentro del horario de visitas; si la ruta es hoy, no anterior a la hora actual.
 * - Al menos REGLAS_RUTA.separacionMinutos respecto a las demás paradas.
 * - A no más de RADIO_KM (línea recta) de la primera parada de la ruta.
 */
async function validarPlanificacion(conn: Conn, idRuta: number, ruta: RutaBloqueada, input: AsignarDocumentoRuta) {
  const hoy = businessTodayIso();
  if (ruta.FECHA && ruta.FECHA < hoy) {
    throw new ConflictError(`La ruta estaba planificada para el ${fechaLegible(ruta.FECHA)}; cambia su fecha antes de agregar paradas.`);
  }
  const hora = input.horaProgramada;
  if (!esHoraDeVisita(hora)) {
    throw campo('horaProgramada', `La hora debe estar dentro de la jornada del cobrador (${JORNADA_COBRADOR}).`);
  }
  if (ruta.FECHA === hoy && hora < businessNowHHMM()) {
    throw campo('horaProgramada', `La ruta es hoy y esa hora ya pasó (son las ${businessNowHHMM()}).`);
  }

  const paradas = await conn.execute<{ HORA_PROGRAMADA: string | null; LATITUD: number | null; LONGITUD: number | null }>(
    `SELECT HORA_PROGRAMADA, LATITUD, LONGITUD FROM CXC_RUTA_DETALLE
      WHERE ID_RUTA=:idRuta AND ID_DOCUMENTO IS NOT NULL ORDER BY ID_RUTA_DETALLE`, {idRuta});
  const filas = paradas.rows ?? [];
  const choque = choqueDeHorario(hora, filas.map((p) => p.HORA_PROGRAMADA));
  if (choque) {
    const libre = primeraHoraLibre(filas.map((p) => p.HORA_PROGRAMADA), hora);
    throw campo('horaProgramada', `Ya hay una visita a las ${choque}; deja al menos ${REGLAS_RUTA.separacionMinutos} minutos entre paradas${libre ? ` (siguiente hora libre: ${libre})` : ''}.`);
  }

  const ancla = filas.find((p) => p.LATITUD != null && p.LONGITUD != null);
  if (ancla) {
    const km = distanciaKm({ lat: Number(ancla.LATITUD), lon: Number(ancla.LONGITUD) }, { lat: input.latitud, lon: input.longitud });
    const radio = Number(ruta.RADIO_KM ?? REGLAS_RUTA.radioKmDefecto);
    if (km > radio) {
      throw campo('latitud', `La parada está a ${km.toFixed(1)} km de la primera parada de la ruta; el máximo para esta ruta es ${radio} km. Asígnala a otra ruta de esa zona.`);
    }
  }
}

const campo = (nombre: string, mensaje: string) => new AppError(mensaje, 400, 'BAD_REQUEST', true, [{ campo: nombre, mensaje }]);
