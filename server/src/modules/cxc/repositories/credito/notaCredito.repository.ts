
import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import { businessTodayIso } from '../../../../shared/date';

import type {
  NotaCredito,
  CreateNotaCreditoInput,
  UpdateNotaCreditoInput,
  AnularNotaCreditoInput,
} from '@erp/contracts';

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../../shared/errors/AppError';
import { siguienteNumeroNotaCredito } from '../../shared/correlativos';

// =====================================================
// ESTADOS EN LOS QUE UNA NOTA PUEDE MODIFICARSE
// =====================================================

export function isNotaCreditoAplicable(
  estado: string | null | undefined,
): boolean {
  return ['PENDIENTE', 'ACTIVA'].includes(
    String(estado ?? '').trim().toUpperCase(),
  );
}

// =====================================================
// INTERFAZ DE RESULTADOS DE ORACLE
// =====================================================

interface NotaCreditoRow {
  ID_NOTA_CREDITO: number;
  ID_CLIENTE: number;
  NOMBRE_CLIENTE: string | null;
  ID_DOCUMENTO_REFERENCIA: number | null;
  DESCRIPCION: string | null;
  SERIE: string | null;
  NUMERO: string | null;

  FECHA_ISO: string;

  MONTO: number;
  MONTO_APLICADO: number;
  MONTO_DISPONIBLE: number;
  ESTADO: string;

  ID_EMPLEADO_ANULACION: number | null;
  NOMBRE_EMPLEADO_ANULACION: string | null;
  FECHA_ANULACION_ISO: string | null;
  MOTIVO_ANULACION: string | null;

  ID_EMPLEADO_REGISTRO: number | null;
  NOMBRE_EMPLEADO_REGISTRO: string | null;
  FECHA_REGISTRO_ISO: string | null;
  ID_EMPLEADO_APROBACION: number | null;
  NOMBRE_EMPLEADO_APROBACION: string | null;
  FECHA_APROBACION_ISO: string | null;
}

// =====================================================
// MAPEO DE RESULTADOS
// =====================================================

function mapRow(row: NotaCreditoRow): NotaCredito {
  return {
    idNotaCredito: row.ID_NOTA_CREDITO,
    idCliente: row.ID_CLIENTE,
    nombreCliente: row.NOMBRE_CLIENTE,
    idDocumentoReferencia: row.ID_DOCUMENTO_REFERENCIA,
    descripcion: row.DESCRIPCION,
    serie: row.SERIE,
    numero: row.NUMERO,

    // TO_CHAR devuelve exactamente la fecha
    // registrada en Oracle, sin conversión UTC.
    fecha: row.FECHA_ISO,

    monto: row.MONTO,
    montoAplicado: Number(row.MONTO_APLICADO ?? 0),
    montoDisponible: Number(
      row.MONTO_DISPONIBLE ?? row.MONTO,
    ),

    estado: row.ESTADO as NotaCredito['estado'],

    idEmpleadoAnulacion: row.ID_EMPLEADO_ANULACION,
    nombreEmpleadoAnulacion: row.NOMBRE_EMPLEADO_ANULACION,
    fechaAnulacion: row.FECHA_ANULACION_ISO,
    motivoAnulacion: row.MOTIVO_ANULACION,

    idEmpleadoRegistro: row.ID_EMPLEADO_REGISTRO,
    nombreEmpleadoRegistro: row.NOMBRE_EMPLEADO_REGISTRO,
    fechaRegistro: row.FECHA_REGISTRO_ISO,
    idEmpleadoAprobacion: row.ID_EMPLEADO_APROBACION,
    nombreEmpleadoAprobacion: row.NOMBRE_EMPLEADO_APROBACION,
    fechaAprobacion: row.FECHA_APROBACION_ISO,
  };
}

// =====================================================
// CONSULTA BASE
// =====================================================

const SELECT_BASE = `
  SELECT
    n.ID_NOTA_CREDITO,
    n.ID_CLIENTE,
    c.NOMBRE AS NOMBRE_CLIENTE,
    n.ID_DOCUMENTO_REFERENCIA,
    n.DESCRIPCION,
    n.SERIE,
    n.NUMERO,

    TO_CHAR(n.FECHA, 'YYYY-MM-DD') AS FECHA_ISO,

    n.MONTO,

    NVL(
      (
        SELECT SUM(a.MONTO_APLICADO)
        FROM CXC_APLICACION_NOTA_CREDITO a
        WHERE a.ID_NOTA_CREDITO = n.ID_NOTA_CREDITO
          AND a.ESTADO = 'CONFIRMADA'
      ),
      0
    ) AS MONTO_APLICADO,

    GREATEST(
      n.MONTO -
      NVL(
        (
          SELECT SUM(a.MONTO_APLICADO)
          FROM CXC_APLICACION_NOTA_CREDITO a
          WHERE a.ID_NOTA_CREDITO = n.ID_NOTA_CREDITO
            AND a.ESTADO = 'CONFIRMADA'
        ),
        0
      ),
      0
    ) AS MONTO_DISPONIBLE,

    n.ESTADO,
    n.ID_EMPLEADO_ANULACION,

    CASE
      WHEN ea.ID_EMPLEADO IS NULL THEN NULL
      ELSE TRIM(
        ea.NOMBRE || ' ' || NVL(ea.APELLIDO, '')
      )
    END AS NOMBRE_EMPLEADO_ANULACION,

    TO_CHAR(
      n.FECHA_ANULACION,
      'YYYY-MM-DD'
    ) AS FECHA_ANULACION_ISO,

    n.MOTIVO_ANULACION,

    n.ID_EMPLEADO_REGISTRO,
    TRIM(er.NOMBRE || ' ' || NVL(er.APELLIDO, '')) AS NOMBRE_EMPLEADO_REGISTRO,
    TO_CHAR(n.FECHA_REGISTRO, 'YYYY-MM-DD HH24:MI') AS FECHA_REGISTRO_ISO,

    n.ID_EMPLEADO_APROBACION,
    TRIM(ep.NOMBRE || ' ' || NVL(ep.APELLIDO, '')) AS NOMBRE_EMPLEADO_APROBACION,
    TO_CHAR(n.FECHA_APROBACION, 'YYYY-MM-DD HH24:MI') AS FECHA_APROBACION_ISO

  FROM CXC_NOTAS_CREDITO n

  LEFT JOIN CLIENTE c
    ON c.ID_CLIENTE = n.ID_CLIENTE

  LEFT JOIN EMPLEADO ea
    ON ea.ID_EMPLEADO = n.ID_EMPLEADO_ANULACION

  LEFT JOIN EMPLEADO er
    ON er.ID_EMPLEADO = n.ID_EMPLEADO_REGISTRO

  LEFT JOIN EMPLEADO ep
    ON ep.ID_EMPLEADO = n.ID_EMPLEADO_APROBACION
`;

// =====================================================
// LISTAR NOTAS DE CRÉDITO
// =====================================================

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
  pendientesAprobacion?: boolean;
}): Promise<{ data: NotaCredito[]; total: number }> {
  const conn = await getConnection();

  try {
    const offset = (params.page - 1) * params.limit;

    const condiciones: string[] = [];
    if (params.pendientesAprobacion) {
      condiciones.push("TRIM(n.ESTADO) IN ('PENDIENTE', 'ACTIVA') AND n.ID_EMPLEADO_APROBACION IS NULL");
    }
    if (params.search) {
      condiciones.push(`(TO_CHAR(n.ID_CLIENTE) LIKE :search
           OR TO_CHAR(n.ID_NOTA_CREDITO) LIKE :search
           OR UPPER(NVL(c.NOMBRE, '')) LIKE UPPER(:search)
           OR UPPER(NVL(n.DESCRIPCION, '')) LIKE UPPER(:search)
           OR UPPER(NVL(n.SERIE, '')) LIKE UPPER(:search)
           OR UPPER(NVL(n.NUMERO, '')) LIKE UPPER(:search)
           OR UPPER(n.ESTADO) LIKE UPPER(:search))`);
    }
    const whereClause = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const searchBind = params.search
      ? { search: `%${params.search}%` }
      : {};

    const dataResult = await conn.execute<NotaCreditoRow>(
      `
        ${SELECT_BASE}
        ${whereClause}

        ORDER BY n.ID_NOTA_CREDITO DESC

        OFFSET :offset ROWS
        FETCH NEXT :limit ROWS ONLY
      `,
      {
        ...searchBind,
        offset,
        limit: params.limit,
      },
    );

    const countResult = await conn.execute<{
      TOTAL: number;
    }>(
      `
        SELECT COUNT(*) AS TOTAL
        FROM CXC_NOTAS_CREDITO n
        LEFT JOIN CLIENTE c
          ON c.ID_CLIENTE = n.ID_CLIENTE
        ${whereClause}
      `,
      searchBind,
    );

    return {
      data: (dataResult.rows ?? []).map(mapRow),
      total: countResult.rows?.[0]?.TOTAL ?? 0,
    };
  } finally {
    await conn.close();
  }
}

// =====================================================
// CONSULTAR NOTA POR ID
// =====================================================

export async function findById(
  id: number,
): Promise<NotaCredito | null> {
  const conn = await getConnection();

  try {
    const result = await conn.execute<NotaCreditoRow>(
      `
        ${SELECT_BASE}
        WHERE n.ID_NOTA_CREDITO = :id
      `,
      { id },
    );

    const row = result.rows?.[0];

    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

// =====================================================
// CREAR NOTA DE CRÉDITO
// =====================================================

export async function create(
  input: CreateNotaCreditoInput,
  idEmpleadoRegistro: number,
): Promise<number> {
  const hoy = businessTodayIso();

  // La fecha de emisión debe ser la fecha actual de Guatemala.
  // Revalidamos también aquí por si se llama al repositorio directamente.
  if (input.fecha !== hoy) {
    throw new BadRequestError(
      'La fecha de la nota de crédito debe ser la fecha actual de Guatemala. No se permiten fechas anteriores ni futuras.',
    );
  }

  const conn = await getConnection();

  try {
    // Verificar que no haya cambiado el día durante la operación.
    const fechaRegistro = businessTodayIso();
    if (input.fecha !== fechaRegistro) {
      throw new BadRequestError(
        'La fecha de Guatemala cambió durante el registro. Intenta guardar nuevamente.',
      );
    }

    // Serie y número automáticos (bloquea la tabla hasta el commit).
    const { serie, numero } = await siguienteNumeroNotaCredito(conn);

    const result = await conn.execute<{
      id: number[];
    }>(
      `
        INSERT INTO CXC_NOTAS_CREDITO (
          ID_CLIENTE,
          ID_DOCUMENTO_REFERENCIA,
          DESCRIPCION,
          SERIE,
          NUMERO,
          FECHA,
          MONTO,
          ESTADO,
          ID_EMPLEADO_REGISTRO,
          FECHA_REGISTRO
        )
        VALUES (
          :idCliente,
          :idDocumentoReferencia,
          :descripcion,
          :serie,
          :numero,
          TO_DATE(:fecha, 'YYYY-MM-DD'),
          :monto,
          'PENDIENTE',
          :idEmpleadoRegistro,
          SYSDATE
        )
        RETURNING ID_NOTA_CREDITO INTO :id
      `,
      {
        idCliente: input.idCliente,
        idDocumentoReferencia:
          input.idDocumentoReferencia ?? null,
        descripcion: input.descripcion,
        serie,
        numero,
        fecha: fechaRegistro,
        monto: input.monto,
        idEmpleadoRegistro,
        id: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER,
        },
      },
    );

    const idNotaCredito = result.outBinds!.id[0];

    await conn.commit();

    return idNotaCredito;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

// =====================================================
// BLOQUEO Y VALIDACIÓN DE NOTA
// =====================================================

interface NotaCreditoLockRow {
  ESTADO: string;
  FECHA_ISO: string;
}

async function lockYValidarSinAplicaciones(
  conn: oracledb.Connection,
  id: number,
  mensajeSiAplicada: string,
): Promise<NotaCreditoLockRow> {
  // Bloquear la nota para evitar modificaciones
  // concurrentes mientras se valida su estado.

  const lockResult =
    await conn.execute<NotaCreditoLockRow>(
      `
        SELECT
          ESTADO,
          TO_CHAR(FECHA, 'YYYY-MM-DD') AS FECHA_ISO
        FROM CXC_NOTAS_CREDITO
        WHERE ID_NOTA_CREDITO = :id
        FOR UPDATE
      `,
      { id },
    );

  const row = lockResult.rows?.[0];

  if (!row) {
    throw new NotFoundError(
      `Nota de crédito ${id} no encontrada`,
    );
  }

  // Verificar aplicaciones confirmadas
  // dentro de la misma transacción.

  const sumResult = await conn.execute<{
    TOTAL: number;
  }>(
    `
      SELECT
        NVL(SUM(MONTO_APLICADO), 0) AS TOTAL
      FROM CXC_APLICACION_NOTA_CREDITO
      WHERE ID_NOTA_CREDITO = :id
        AND ESTADO = 'CONFIRMADA'
    `,
    { id },
  );

  if (
    Number(sumResult.rows?.[0]?.TOTAL ?? 0) > 0.005
  ) {
    throw new ConflictError(mensajeSiAplicada);
  }

  return row;
}

// =====================================================
// ACTUALIZAR NOTA DE CRÉDITO
// =====================================================

export async function update(
  id: number,
  input: UpdateNotaCreditoInput,
): Promise<void> {
  // La fecha de emisión es inmutable después del registro.
  // El servicio omite este campo al actualizar la nota.
  if (input.fecha !== undefined) {
    throw new BadRequestError(
      'La fecha de una nota de crédito registrada no puede modificarse.',
    );
  }

  const fields: string[] = [];

  const binds: Record<
    string,
    string | number | null
  > = { id };

  if (input.idCliente !== undefined) {
    fields.push('ID_CLIENTE = :idCliente');
    binds.idCliente = input.idCliente;
  }

  if (input.idDocumentoReferencia !== undefined) {
    fields.push(
      'ID_DOCUMENTO_REFERENCIA = :idDocumentoReferencia',
    );
    binds.idDocumentoReferencia =
      input.idDocumentoReferencia ?? null;
  }

  if (input.descripcion !== undefined) {
    fields.push('DESCRIPCION = :descripcion');
    binds.descripcion = input.descripcion ?? null;
  }

  if (input.monto !== undefined) {
    fields.push('MONTO = :monto');
    binds.monto = input.monto;
  }

  if (fields.length === 0) {
    return;
  }

  const conn = await getConnection();

  try {
    const row = await lockYValidarSinAplicaciones(
      conn,
      id,
      'La nota de crédito ya tiene aplicaciones y no puede editarse directamente. Primero debe reversarse la aplicación.',
    );

    // CORRECCIÓN:
    // No permitir modificaciones sobre notas
    // anuladas ni sobre otros estados cerrados.

    if (!isNotaCreditoAplicable(row.ESTADO)) {
      throw new ConflictError(
        'Solo las notas de crédito pendientes o activas y sin aplicaciones pueden modificarse.',
      );
    }

    // Una nota que ya se asignó a una factura (aunque luego se reversara) queda
    // ligada a ese cliente y esa factura: no puede pasar a otra.
    if (input.idCliente !== undefined || input.idDocumentoReferencia !== undefined) {
      const historial = await conn.execute<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL FROM CXC_APLICACION_NOTA_CREDITO WHERE ID_NOTA_CREDITO = :id`,
        { id },
      );
      const actual = await conn.execute<{ ID_CLIENTE: number; ID_DOCUMENTO_REFERENCIA: number | null }>(
        `SELECT ID_CLIENTE, ID_DOCUMENTO_REFERENCIA FROM CXC_NOTAS_CREDITO WHERE ID_NOTA_CREDITO = :id`,
        { id },
      );
      const cambiaDestino =
        (input.idCliente !== undefined && input.idCliente !== actual.rows?.[0]?.ID_CLIENTE) ||
        (input.idDocumentoReferencia !== undefined && input.idDocumentoReferencia !== actual.rows?.[0]?.ID_DOCUMENTO_REFERENCIA);
      if (cambiaDestino && Number(historial.rows?.[0]?.TOTAL ?? 0) > 0) {
        throw new ConflictError(
          'Esta nota ya se asignó a una factura; no puede cambiarse de cliente ni de factura.',
        );
      }
    }

    // Todo cambio vuelve a requerir la aprobación de un administrador.
    fields.push('ID_EMPLEADO_APROBACION = NULL', 'FECHA_APROBACION = NULL');

    await conn.execute(
      `
        UPDATE CXC_NOTAS_CREDITO
        SET ${fields.join(', ')}
        WHERE ID_NOTA_CREDITO = :id
      `,
      binds,
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

// =====================================================
// ELIMINAR NOTA DE CRÉDITO
// =====================================================

export async function remove(
  id: number,
): Promise<void> {
  const conn = await getConnection();

  try {
    const row = await lockYValidarSinAplicaciones(
      conn,
      id,
      'Una nota de crédito aplicada no se elimina. Debe reversarse/anularse para conservar trazabilidad.',
    );

    if (!isNotaCreditoAplicable(row.ESTADO)) {
      throw new ConflictError(
        'Solo una nota pendiente o activa y sin aplicaciones puede eliminarse físicamente.',
      );
    }

    await conn.execute(
      `
        DELETE FROM CXC_NOTAS_CREDITO
        WHERE ID_NOTA_CREDITO = :id
      `,
      { id },
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

// =====================================================
// ANULACIÓN FORMAL DE NOTA DE CRÉDITO
// =====================================================

export async function anular(
  id: number,
  input: AnularNotaCreditoInput,
): Promise<void> {
  const conn = await getConnection();

  try {
    const row = await lockYValidarSinAplicaciones(
      conn,
      id,
      'Esta nota de crédito tiene aplicaciones vigentes. Reversa cada aplicación antes de anularla.',
    );

    const estadoActual = String(
      row.ESTADO ?? '',
    ).trim().toUpperCase();

    if (estadoActual === 'ANULADA') {
      throw new ConflictError(
        'Esta nota de crédito ya está anulada.',
      );
    }

    // Impedir anular notas en otros estados cerrados.
    if (!isNotaCreditoAplicable(estadoActual)) {
      throw new ConflictError(
        'La nota de crédito no está en un estado que permita su anulación.',
      );
    }

    // Utilizar fecha de Guatemala cuando el usuario
    // no proporcione una fecha de anulación.

    const fechaAnulacion =
      input.fechaAnulacion ?? businessTodayIso();

    const hoy = businessTodayIso();

    // CORRECCIÓN:
    // La anulación no puede ser anterior
    // a la emisión de la nota.

    if (fechaAnulacion < row.FECHA_ISO) {
      throw new BadRequestError(
        'La fecha de anulación no puede ser anterior a la fecha de emisión de la nota de crédito.',
      );
    }

    // Tampoco puede ser posterior al día actual.
    if (fechaAnulacion > hoy) {
      throw new BadRequestError(
        'La fecha de anulación no puede ser futura.',
      );
    }

    await conn.execute(
      `
        UPDATE CXC_NOTAS_CREDITO
        SET
          ESTADO = 'ANULADA',
          ID_EMPLEADO_ANULACION = :idEmpleadoAnulacion,
          FECHA_ANULACION =
            TO_DATE(:fechaAnulacion, 'YYYY-MM-DD'),
          MOTIVO_ANULACION = :motivoAnulacion
        WHERE ID_NOTA_CREDITO = :id
      `,
      {
        idEmpleadoAnulacion:
          input.idEmpleadoAnulacion,
        fechaAnulacion,
        motivoAnulacion:
          input.motivoAnulacion,
        id,
      },
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

// =====================================================
// VISTA PREVIA DE SERIE Y NÚMERO
// =====================================================

/** Serie y número que tendría hoy la próxima nota de crédito (sin bloquear). */
export async function previewNumero(): Promise<{ serie: string; numero: string }> {
  const conn = await getConnection();
  try {
    return await siguienteNumeroNotaCredito(conn, { bloquear: false });
  } finally {
    await conn.close();
  }
}
