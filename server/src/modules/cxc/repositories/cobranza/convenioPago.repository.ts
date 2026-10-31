import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type { ConvenioPago, CreateConvenioPagoInput, UpdateConvenioPagoInput } from '@erp/contracts';
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/errors/AppError';
import { EPSILON } from '../../shared/financialRules';
import { businessTodayIso } from '../../../../shared/date';

interface ConvenioPagoRow {
  ID_CONVENIO: number;
  ID_CLIENTE: number;
  NOMBRE_CLIENTE: string | null;
  FECHA_CONVENIO: Date;
  MONTO_DEUDA: number;
  MONTO_PAGADO: number;
  SALDO_PENDIENTE: number;
  CUOTAS_PAGADAS: number;
  NUMERO_CUOTAS: number;
  ESTADO: string;
  OBSERVACIONES: string | null;
}

function mapRow(row: ConvenioPagoRow): ConvenioPago {
  return {
    idConvenio: row.ID_CONVENIO,
    idCliente: row.ID_CLIENTE,
    nombreCliente: row.NOMBRE_CLIENTE,
    fechaConvenio: row.FECHA_CONVENIO?.toISOString() ?? '',
    montoDeuda: row.MONTO_DEUDA,
    montoPagado: Number(row.MONTO_PAGADO ?? 0),
    saldoPendiente: Number(row.SALDO_PENDIENTE ?? row.MONTO_DEUDA),
    cuotasPagadas: Number(row.CUOTAS_PAGADAS ?? 0),
    numeroCuotas: row.NUMERO_CUOTAS,
    estado: row.ESTADO as ConvenioPago['estado'],
    observaciones: row.OBSERVACIONES,
  };
}

const SELECT_BASE = `
  SELECT cv.ID_CONVENIO, cv.ID_CLIENTE, c.NOMBRE AS NOMBRE_CLIENTE, cv.FECHA_CONVENIO,
         cv.MONTO_DEUDA,
         NVL((SELECT SUM(cc.MONTO - cc.SALDO) FROM CXC_CONVENIO_CUOTAS cc WHERE cc.ID_CONVENIO = cv.ID_CONVENIO), 0) AS MONTO_PAGADO,
         NVL((SELECT SUM(cc.SALDO) FROM CXC_CONVENIO_CUOTAS cc WHERE cc.ID_CONVENIO = cv.ID_CONVENIO), cv.MONTO_DEUDA) AS SALDO_PENDIENTE,
         (SELECT COUNT(*) FROM CXC_CONVENIO_CUOTAS cc WHERE cc.ID_CONVENIO = cv.ID_CONVENIO AND cc.ESTADO = 'PAGADA') AS CUOTAS_PAGADAS,
         cv.NUMERO_CUOTAS, cv.ESTADO, cv.OBSERVACIONES
  FROM CXC_CONVENIOS_PAGO cv
  JOIN CLIENTE c ON c.ID_CLIENTE = cv.ID_CLIENTE
`;

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{ data: ConvenioPago[]; total: number }> {
  const conn = await getConnection();
  try {
    const offset = (params.page - 1) * params.limit;
    const whereClause = params.search
      ? `WHERE UPPER(c.NOMBRE) LIKE UPPER(:search) OR UPPER(cv.ESTADO) LIKE UPPER(:search)`
      : '';
    const searchBind = params.search ? { search: `%${params.search}%` } : {};

    const dataResult = await conn.execute<ConvenioPagoRow>(
      `${SELECT_BASE} ${whereClause}
       ORDER BY cv.FECHA_CONVENIO DESC, cv.ID_CONVENIO DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...searchBind, offset, limit: params.limit },
    );

    const countResult = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL FROM CXC_CONVENIOS_PAGO cv JOIN CLIENTE c ON c.ID_CLIENTE = cv.ID_CLIENTE ${whereClause}`,
      searchBind,
    );

    const total = countResult.rows?.[0]?.TOTAL ?? 0;
    return { data: (dataResult.rows ?? []).map(mapRow), total };
  } finally {
    await conn.close();
  }
}

export async function findById(id: number): Promise<ConvenioPago | null> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<ConvenioPagoRow>(`${SELECT_BASE} WHERE cv.ID_CONVENIO = :id`, { id });
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

/**
 * Crea el convenio y todas sus cuotas en una sola conexión/transacción:
 * un solo commit al final, rollback completo si cualquier INSERT falla.
 * Evita dejar un convenio sin cuotas ante un fallo a mitad de camino.
 */
export async function createConCuotas(
  input: CreateConvenioPagoInput,
  cuotas: Array<{ numeroCuota: number; fechaVencimiento: string; monto: number }>,
  documentos: Array<{ idDocumento: number; montoIncluido: number }>,
): Promise<number> {
  const conn = await getConnection();
  try {
    // Los documentos se bloquean en orden estable y se vuelve a validar dentro
    // de la misma transacciÃ³n que inserta el convenio. AsÃ­ dos solicitudes
    // simultÃ¡neas no pueden cubrir la misma factura con convenios activos.
    const ids = new Set<number>();
    let monedaDocumentos: number | null = null;
    let totalIncluido = 0;
    for (const doc of [...documentos].sort((a, b) => a.idDocumento - b.idDocumento)) {
      if (ids.has(doc.idDocumento)) throw new BadRequestError('No se puede incluir el mismo documento dos veces en el convenio');
      ids.add(doc.idDocumento);
      const result = await conn.execute<{ ID_CLIENTE: number; ID_MONEDA: number; SALDO: number }>(
        `SELECT ID_CLIENTE, ID_MONEDA, SALDO FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO = :id FOR UPDATE`,
        { id: doc.idDocumento },
      );
      const row = result.rows?.[0];
      if (!row || row.ID_CLIENTE !== input.idCliente || Number(row.SALDO) <= EPSILON) {
        throw new BadRequestError(`El documento #${doc.idDocumento} ya no pertenece al cliente o no tiene saldo pendiente`);
      }
      if (doc.montoIncluido > Number(row.SALDO) + EPSILON) {
        throw new BadRequestError(`El monto incluido para el documento #${doc.idDocumento} supera su saldo actual`);
      }
      if (monedaDocumentos !== null && monedaDocumentos !== row.ID_MONEDA) {
        throw new BadRequestError('Todos los documentos de un convenio deben estar en la misma moneda');
      }
      monedaDocumentos = row.ID_MONEDA;
      const vigente = await conn.execute<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL
           FROM CXC_CONVENIO_DOCUMENTOS cvd
           JOIN CXC_CONVENIOS_PAGO cv ON cv.ID_CONVENIO = cvd.ID_CONVENIO
          WHERE cvd.ID_DOCUMENTO = :idDocumento AND UPPER(TRIM(cv.ESTADO)) = 'ACTIVO'`,
        { idDocumento: doc.idDocumento },
      );
      if (Number(vigente.rows?.[0]?.TOTAL ?? 0) > 0) {
        throw new ConflictError(`El documento #${doc.idDocumento} ya pertenece a otro convenio activo`);
      }
      totalIncluido = Number((totalIncluido + doc.montoIncluido).toFixed(2));
    }
    if (Math.abs(totalIncluido - input.montoDeuda) > EPSILON) {
      throw new BadRequestError('La suma de los documentos debe coincidir con el monto de la deuda del convenio');
    }

    const result = await conn.execute<{ id: number[] }>(
      `INSERT INTO CXC_CONVENIOS_PAGO
         (ID_CLIENTE, FECHA_CONVENIO, MONTO_DEUDA, NUMERO_CUOTAS, ESTADO, OBSERVACIONES)
       VALUES
         (:idCliente, TO_DATE(:fechaConvenio, 'YYYY-MM-DD'), :montoDeuda, :numeroCuotas, :estado, :observaciones)
       RETURNING ID_CONVENIO INTO :id`,
      {
        idCliente: input.idCliente,
        fechaConvenio: input.fechaConvenio,
        montoDeuda: input.montoDeuda,
        numeroCuotas: input.numeroCuotas,
        estado: input.estado ?? 'ACTIVO',
        observaciones: input.observaciones ?? null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
    );
    const idConvenio = result.outBinds!.id[0];

    for (const cuota of cuotas) {
      await conn.execute(
        `INSERT INTO CXC_CONVENIO_CUOTAS
           (ID_CONVENIO, NUMERO_CUOTA, FECHA_VENCIMIENTO, MONTO, SALDO, ESTADO)
         VALUES
           (:idConvenio, :numeroCuota, TO_DATE(:fechaVencimiento, 'YYYY-MM-DD'), :monto, :monto, 'PENDIENTE')`,
        {
          idConvenio,
          numeroCuota: cuota.numeroCuota,
          fechaVencimiento: cuota.fechaVencimiento,
          monto: cuota.monto,
        },
      );
    }

    for (const doc of documentos) {
      await conn.execute(
        `INSERT INTO CXC_CONVENIO_DOCUMENTOS (ID_CONVENIO, ID_DOCUMENTO, MONTO_INCLUIDO)
         VALUES (:idConvenio, :idDocumento, :montoIncluido)`,
        { idConvenio, idDocumento: doc.idDocumento, montoIncluido: doc.montoIncluido },
      );
    }

    await conn.commit();
    return idConvenio;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

export async function update(id: number, input: UpdateConvenioPagoInput): Promise<void> {
  if (input.observaciones === undefined) return;
  // montoDeuda, numeroCuotas y fechaConvenio no se editan aquí a propósito:
  // ya generaron las cuotas al crearse el convenio.

  const conn = await getConnection();
  try {
    const current = await conn.execute(`SELECT ID_CONVENIO FROM CXC_CONVENIOS_PAGO WHERE ID_CONVENIO = :id FOR UPDATE`, { id });
    if (!current.rows?.length) throw new NotFoundError(`Convenio ${id} no encontrado`);
    await conn.execute(`UPDATE CXC_CONVENIOS_PAGO SET OBSERVACIONES = :observaciones WHERE ID_CONVENIO = :id`, {
      id,
      observaciones: input.observaciones,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

/** CancelaciÃ³n explÃ­cita: cumplimiento e incumplimiento los determina el sistema. */
export async function cancelar(id: number): Promise<void> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ ESTADO: string }>(
      `SELECT ESTADO FROM CXC_CONVENIOS_PAGO WHERE ID_CONVENIO = :id FOR UPDATE`,
      { id },
    );
    const estado = result.rows?.[0]?.ESTADO;
    if (!estado) throw new NotFoundError(`Convenio ${id} no encontrado`);
    if (estado === 'CANCELADO') throw new ConflictError('El convenio ya estÃ¡ cancelado.');
    if (estado === 'CUMPLIDO') throw new ConflictError('Un convenio cumplido no se puede cancelar.');
    if (!['ACTIVO', 'INCUMPLIDO'].includes(estado)) throw new ConflictError('El estado actual del convenio no permite cancelarlo.');
    await conn.execute(`UPDATE CXC_CONVENIOS_PAGO SET ESTADO = 'CANCELADO' WHERE ID_CONVENIO = :id`, { id });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

/**
 * Solo se elimina físicamente un convenio "virgen" (ninguna de sus cuotas
 * tiene pago registrado todavía). Uno con pagos debe cancelarse mediante
 * update({estado:'CANCELADO'}), igual que el resto de entidades financieras
 * del sistema (documentos, pagos, NC, ajustes) nunca se borran físicamente
 * una vez que tuvieron movimiento.
 */
export async function remove(id: number): Promise<void> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) TOTAL FROM CXC_CONVENIO_CUOTAS WHERE ID_CONVENIO = :id AND SALDO < MONTO`,
      { id },
    );
    if (Number(result.rows?.[0]?.TOTAL ?? 0) > 0) {
      throw new ConflictError('Este convenio ya tiene pagos registrados; no se puede eliminar físicamente. Cámbialo a CANCELADO en su lugar.');
    }
    await conn.execute(`DELETE FROM CXC_CONVENIO_DOCUMENTOS WHERE ID_CONVENIO = :id`, { id });
    await conn.execute(`DELETE FROM CXC_CONVENIO_CUOTAS WHERE ID_CONVENIO = :id`, { id });
    await conn.execute(`DELETE FROM CXC_CONVENIOS_PAGO WHERE ID_CONVENIO = :id`, { id });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

/**
 * Botón manual (mismo patrón que Mora: no hay cron/job en el proyecto):
 * marca INCUMPLIDO todo convenio ACTIVO que tenga al menos una cuota
 * PENDIENTE cuya fecha de vencimiento ya pasó. Nunca toca convenios ya
 * CUMPLIDO/CANCELADO/INCUMPLIDO.
 */
export async function recalcularIncumplidos(): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `UPDATE CXC_CONVENIOS_PAGO cv
          SET ESTADO = 'INCUMPLIDO'
        WHERE cv.ESTADO = 'ACTIVO'
          AND EXISTS (
            SELECT 1 FROM CXC_CONVENIO_CUOTAS cc
             WHERE cc.ID_CONVENIO = cv.ID_CONVENIO
               AND cc.ESTADO = 'PENDIENTE'
               AND cc.SALDO > :epsilon
               AND cc.FECHA_VENCIMIENTO < TO_DATE(:hoy, 'YYYY-MM-DD')
          )`,
      { epsilon: EPSILON, hoy: businessTodayIso() },
    );
    await conn.commit();
    return result.rowsAffected ?? 0;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}
