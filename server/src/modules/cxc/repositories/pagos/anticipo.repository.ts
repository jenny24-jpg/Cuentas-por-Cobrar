
import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import { businessTodayIso } from '../../../../shared/date';

import type {
  Anticipo,
  CreateAnticipoInput,
  UpdateAnticipoInput,
  AnularAnticipoInput,
} from '@erp/contracts';

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../../shared/errors/AppError';

import { roundMoney } from '../../shared/financialRules';

// =====================================================
// INTERFACES DE ORACLE
// =====================================================

interface Row {
  ID_ANTICIPO: number;
  ID_CLIENTE: number;
  NOMBRE_CLIENTE: string | null;
  ID_PAGO: number | null;
  REFERENCIA_PAGO: string | null;
  MONTO_ORIGINAL: number;
  MONTO_DISPONIBLE: number;

  FECHA_ISO: string;

  ESTADO: string;
  ID_EMPLEADO_ANULACION: number | null;
  NOMBRE_EMPLEADO_ANULACION: string | null;

  FECHA_ANULACION_ISO: string | null;

  MOTIVO_ANULACION: string | null;
}

interface AnticipoBloqueado {
  ID_CLIENTE: number;
  ID_PAGO: number | null;
  ESTADO: string;
  MONTO_ORIGINAL: number;
  MONTO_DISPONIBLE: number;
  FECHA_ISO: string;
}

// =====================================================
// VALIDAR PAGO QUE RESPALDA EL ANTICIPO
// =====================================================

/**
 * Un pago que respalda un anticipo queda reservado
 * completamente para ese anticipo.
 *
 * Se bloquea con FOR UPDATE y se verifica que:
 * - Exista y pertenezca al cliente.
 * - No esté anulado ni reversado.
 * - No tenga aplicaciones confirmadas.
 * - No respalde otro anticipo vigente.
 *
 * El monto original del anticipo será el monto
 * del pago que lo respalda.
 */
async function validarPagoRespaldo(
  conn: oracledb.Connection,
  idPago: number,
  idCliente: number,
  excluirAnticipo?: number,
): Promise<number> {
  const pagoResult = await conn.execute<{
    ID_CLIENTE: number;
    MONTO: number;
    ESTADO: string;
  }>(
    `
      SELECT
        ID_CLIENTE,
        MONTO,
        ESTADO

      FROM CXC_PAGOS

      WHERE ID_PAGO = :idPago

      FOR UPDATE
    `,
    { idPago },
  );

  const pago = pagoResult.rows?.[0];

  if (!pago) {
    throw new BadRequestError(
      'El pago relacionado no existe',
    );
  }

  const estadoPago = String(
    pago.ESTADO ?? '',
  ).trim().toUpperCase();

  if (
    ['ANULADO', 'REVERSADO'].includes(estadoPago)
  ) {
    throw new ConflictError(
      'No se puede relacionar un anticipo con un pago anulado o reversado.',
    );
  }

  if (pago.ID_CLIENTE !== idCliente) {
    throw new BadRequestError(
      'El anticipo y el pago relacionado deben pertenecer al mismo cliente',
    );
  }

  // Verificar aplicaciones confirmadas del pago.

  const aplicado = await conn.execute<{
    TOTAL: number;
  }>(
    `
      SELECT
        NVL(SUM(MONTO_APLICADO), 0) AS TOTAL

      FROM CXC_APLICACION_PAGOS

      WHERE ID_PAGO = :idPago
        AND ESTADO = 'CONFIRMADA'
    `,
    { idPago },
  );

  if (
    Number(aplicado.rows?.[0]?.TOTAL ?? 0) > 0.005
  ) {
    throw new ConflictError(
      'El pago ya tiene aplicaciones a documentos; no puede respaldar un anticipo.',
    );
  }

  // Evitar que un mismo pago respalde
  // más de un anticipo vigente.

  const otros = await conn.execute<{
    TOTAL: number;
  }>(
    `
      SELECT COUNT(*) AS TOTAL

      FROM CXC_ANTICIPOS

      WHERE ID_PAGO = :idPago
        AND ESTADO <> 'CANCELADO'
        AND (
          :excluir IS NULL
          OR ID_ANTICIPO <> :excluir
        )
    `,
    {
      idPago,
      excluir: excluirAnticipo ?? null,
    },
  );

  if (
    Number(otros.rows?.[0]?.TOTAL ?? 0) > 0
  ) {
    throw new ConflictError(
      'El pago ya respalda otro anticipo vigente.',
    );
  }

  return roundMoney(Number(pago.MONTO));
}

// =====================================================
// MAPEO DE RESULTADOS
// =====================================================

const map = (r: Row): Anticipo => ({
  idAnticipo: r.ID_ANTICIPO,
  idCliente: r.ID_CLIENTE,
  nombreCliente: r.NOMBRE_CLIENTE,
  idPago: r.ID_PAGO,
  referenciaPago: r.REFERENCIA_PAGO,
  montoOriginal: r.MONTO_ORIGINAL,
  montoDisponible: r.MONTO_DISPONIBLE,

  // Se conserva exactamente el día de Oracle.
  fecha: r.FECHA_ISO,

  estado: r.ESTADO as Anticipo['estado'],

  idEmpleadoAnulacion:
    r.ID_EMPLEADO_ANULACION,

  nombreEmpleadoAnulacion:
    r.NOMBRE_EMPLEADO_ANULACION,

  fechaAnulacion: r.FECHA_ANULACION_ISO,
  motivoAnulacion: r.MOTIVO_ANULACION,
});

// =====================================================
// CONSULTA BASE
// =====================================================

const SELECT_BASE = `
  SELECT
    a.ID_ANTICIPO,
    a.ID_CLIENTE,

    c.NOMBRE AS NOMBRE_CLIENTE,

    a.ID_PAGO,

    p.NUMERO_REFERENCIA AS REFERENCIA_PAGO,

    a.MONTO_ORIGINAL,
    a.MONTO_DISPONIBLE,

    TO_CHAR(
      a.FECHA,
      'YYYY-MM-DD'
    ) AS FECHA_ISO,

    a.ESTADO,
    a.ID_EMPLEADO_ANULACION,

    CASE
      WHEN ea.ID_EMPLEADO IS NULL THEN NULL
      ELSE TRIM(
        ea.NOMBRE || ' ' || NVL(ea.APELLIDO, '')
      )
    END AS NOMBRE_EMPLEADO_ANULACION,

    TO_CHAR(
      a.FECHA_ANULACION,
      'YYYY-MM-DD'
    ) AS FECHA_ANULACION_ISO,

    a.MOTIVO_ANULACION

  FROM CXC_ANTICIPOS a

  JOIN CLIENTE c
    ON c.ID_CLIENTE = a.ID_CLIENTE

  LEFT JOIN CXC_PAGOS p
    ON p.ID_PAGO = a.ID_PAGO

  LEFT JOIN EMPLEADO ea
    ON ea.ID_EMPLEADO = a.ID_EMPLEADO_ANULACION
`;

// =====================================================
// LISTAR ANTICIPOS
// =====================================================

export async function findAll({
  page,
  limit,
  search,
}: {
  page: number;
  limit: number;
  search?: string;
}) {
  const conn = await getConnection();

  try {
    const where = search
      ? `
        WHERE UPPER(c.NOMBRE) LIKE UPPER(:search)
           OR UPPER(a.ESTADO) LIKE UPPER(:search)
           OR UPPER(p.NUMERO_REFERENCIA) LIKE UPPER(:search)
           OR TO_CHAR(a.ID_ANTICIPO) LIKE :search
      `
      : '';

    const searchBinds = search
      ? { search: `%${search}%` }
      : {};

    const data = await conn.execute<Row>(
      `
        ${SELECT_BASE}
        ${where}

        ORDER BY
          a.FECHA DESC,
          a.ID_ANTICIPO DESC

        OFFSET :offset ROWS
        FETCH NEXT :limit ROWS ONLY
      `,
      {
        ...searchBinds,
        offset: (page - 1) * limit,
        limit,
      },
    );

    const count = await conn.execute<{
      TOTAL: number;
    }>(
      `
        SELECT COUNT(*) AS TOTAL

        FROM CXC_ANTICIPOS a

        JOIN CLIENTE c
          ON c.ID_CLIENTE = a.ID_CLIENTE

        LEFT JOIN CXC_PAGOS p
          ON p.ID_PAGO = a.ID_PAGO

        ${where}
      `,
      searchBinds,
    );

    return {
      data: (data.rows ?? []).map(map),
      total: count.rows?.[0]?.TOTAL ?? 0,
    };
  } finally {
    await conn.close();
  }
}

// =====================================================
// CONSULTAR ANTICIPO POR ID
// =====================================================

export async function findById(
  id: number,
): Promise<Anticipo | null> {
  const conn = await getConnection();

  try {
    const result = await conn.execute<Row>(
      `
        ${SELECT_BASE}
        WHERE a.ID_ANTICIPO = :id
      `,
      { id },
    );

    return result.rows?.[0]
      ? map(result.rows[0])
      : null;
  } finally {
    await conn.close();
  }
}

// =====================================================
// CREAR ANTICIPO
// =====================================================

/**
 * Las aplicaciones y reversas modifican
 * MONTO_DISPONIBLE mediante su repositorio.
 *
 * La creación inicia con el saldo completo
 * del pago que respalda el anticipo.
 */
export async function create(
  input: CreateAnticipoInput,
): Promise<number> {
  // CORRECCIÓN:
  // Solo se admite la fecha actual de Guatemala.

  const hoy = businessTodayIso();

  if (input.fecha !== hoy) {
    throw new BadRequestError(
      'La fecha del anticipo debe ser la fecha actual del sistema (Guatemala). No se permiten fechas anteriores ni futuras.',
    );
  }

  const conn = await getConnection();

  try {
    // Revalidar la fecha antes del INSERT.
    // La fecha se obtiene del servidor.

    if (input.fecha !== businessTodayIso()) {
      throw new BadRequestError(
        'La fecha del sistema cambió durante el registro. Vuelve a guardar el anticipo.',
      );
    }

    const id = await crearEnConexion(conn, {
      idCliente: input.idCliente,
      idPago: input.idPago,
    });

    await conn.commit();

    return id;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.close();
  }
}

/**
 * Crea el anticipo respaldado por un pago sobre una conexión ya abierta, sin
 * commit: lo usa create() y también pago.repository::create() para registrar
 * el pago y su anticipo en una sola transacción. Valida y bloquea el pago
 * (mismo cliente, sin aplicaciones, sin otro anticipo vigente) y toma su monto.
 */
export async function crearEnConexion(
  conn: oracledb.Connection,
  input: { idCliente: number; idPago: number },
): Promise<number> {
  // Conservar el bloqueo del pago
  // que respalda el anticipo.

  const original = await validarPagoRespaldo(
    conn,
    input.idPago,
    input.idCliente,
  );

  const fechaRegistro = businessTodayIso();

  const result = await conn.execute<{
    id: number[];
  }>(
    `
      INSERT INTO CXC_ANTICIPOS (
        ID_CLIENTE,
        ID_PAGO,
        MONTO_ORIGINAL,
        MONTO_DISPONIBLE,
        FECHA,
        ESTADO
      )
      VALUES (
        :idCliente,
        :idPago,
        :montoOriginal,
        :montoDisponible,
        TO_DATE(:fecha, 'YYYY-MM-DD'),
        'DISPONIBLE'
      )

      RETURNING ID_ANTICIPO INTO :id
    `,
    {
      idCliente: input.idCliente,
      idPago: input.idPago,

      montoOriginal: original,
      montoDisponible: original,

      // Nunca se toma directamente la fecha
      // proporcionada por el navegador.
      fecha: fechaRegistro,

      id: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
    },
  );

  return result.outBinds!.id[0];
}

// =====================================================
// BLOQUEAR ANTICIPO
// =====================================================

async function bloquearAnticipo(
  conn: oracledb.Connection,
  id: number,
): Promise<AnticipoBloqueado> {
  const result =
    await conn.execute<AnticipoBloqueado>(
      `
        SELECT
          ID_CLIENTE,
          ID_PAGO,
          ESTADO,
          MONTO_ORIGINAL,
          MONTO_DISPONIBLE,

          TO_CHAR(
            FECHA,
            'YYYY-MM-DD'
          ) AS FECHA_ISO

        FROM CXC_ANTICIPOS

        WHERE ID_ANTICIPO = :id

        FOR UPDATE
      `,
      { id },
    );

  const item = result.rows?.[0];

  if (!item) {
    throw new NotFoundError(
      `Anticipo ${id} no encontrado`,
    );
  }

  return item;
}

// =====================================================
// COMPROBAR HISTORIAL DE APLICACIONES
// =====================================================

async function tieneHistorialAplicaciones(
  conn: oracledb.Connection,
  id: number,
): Promise<boolean> {
  const result = await conn.execute<{
    TOTAL: number;
  }>(
    `
      SELECT COUNT(*) AS TOTAL

      FROM CXC_APLICACION_ANTICIPO

      WHERE ID_ANTICIPO = :id
    `,
    { id },
  );

  return Number(
    result.rows?.[0]?.TOTAL ?? 0,
  ) > 0;
}

// =====================================================
// ACTUALIZAR ANTICIPO
// =====================================================

export async function update(
  id: number,
  input: UpdateAnticipoInput,
): Promise<void> {
  // CORRECCIÓN:
  // Ninguna llamada directa al repositorio
  // puede cambiar la fecha original.

  if (input.fecha !== undefined) {
    throw new BadRequestError(
      'La fecha de un anticipo registrado no puede modificarse.',
    );
  }

  const fields: string[] = [];

  const binds: Record<
    string,
    string | number | null
  > = { id };

  const conn = await getConnection();

  try {
    const current = await bloquearAnticipo(
      conn,
      id,
    );

    // Solo anticipos disponibles.

    if (
      String(current.ESTADO ?? '')
        .trim()
        .toUpperCase() !== 'DISPONIBLE'
    ) {
      throw new ConflictError(
        'Solo los anticipos disponibles pueden modificarse.',
      );
    }

    // Conservar historial financiero:
    // se bloquea toda edición cuando ya
    // existen aplicaciones, incluso reversadas.

    if (
      await tieneHistorialAplicaciones(conn, id)
    ) {
      throw new ConflictError(
        'Este anticipo ya tiene historial de aplicaciones; no puede editarse directamente.',
      );
    }

    const idPagoFinal =
      input.idPago === undefined
        ? current.ID_PAGO
        : input.idPago;

    if (idPagoFinal == null) {
      throw new BadRequestError(
        'Selecciona el pago que respalda el anticipo.',
      );
    }

    // Se conserva la verificación de pago.
    // El monto original y el disponible
    // siguen dependiendo de ese pago.

    const original = await validarPagoRespaldo(
      conn,
      idPagoFinal,
      input.idCliente ?? current.ID_CLIENTE,
      id,
    );

    fields.push(
      'MONTO_ORIGINAL = :montoOriginal',
      'MONTO_DISPONIBLE = :montoOriginal',
    );

    binds.montoOriginal = original;

    const columnas = [
      ['idCliente', 'ID_CLIENTE'],
      ['idPago', 'ID_PAGO'],
    ] as const;

    for (const [key, column] of columnas) {
      const value = input[key];

      if (value !== undefined) {
        fields.push(
          `${column} = :${key}`,
        );

        binds[key] = value;
      }
    }

    // FECHA no se incluye en el UPDATE.
    // La fecha histórica queda intacta.

    if (fields.length > 0) {
      await conn.execute(
        `
          UPDATE CXC_ANTICIPOS

          SET ${fields.join(', ')}

          WHERE ID_ANTICIPO = :id
        `,
        binds,
      );
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.close();
  }
}

// =====================================================
// ELIMINAR ANTICIPO
// =====================================================

export async function remove(
  id: number,
): Promise<void> {
  const conn = await getConnection();

  try {
    const current = await bloquearAnticipo(
      conn,
      id,
    );

    if (
      String(current.ESTADO ?? '')
        .trim()
        .toUpperCase() !== 'DISPONIBLE'
    ) {
      throw new ConflictError(
        'Solo se puede eliminar un anticipo disponible.',
      );
    }

    // Conservar registros históricos.
    // Incluso las aplicaciones reversadas
    // impiden eliminar físicamente el anticipo.

    if (
      await tieneHistorialAplicaciones(conn, id)
    ) {
      throw new ConflictError(
        'No se puede eliminar un anticipo con historial de aplicaciones, incluso si fueron reversadas.',
      );
    }

    await conn.execute(
      `
        DELETE FROM CXC_ANTICIPOS
        WHERE ID_ANTICIPO = :id
      `,
      { id },
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.close();
  }
}

// =====================================================
// ANULAR ANTICIPO
// =====================================================

/**
 * Anulación formal:
 *
 * - Conserva la fila.
 * - Registra empleado responsable.
 * - Registra fecha y motivo.
 * - Rechaza aplicaciones confirmadas.
 * - Rechaza fechas anteriores al anticipo.
 */
export async function anular(
  id: number,
  input: AnularAnticipoInput,
): Promise<void> {
  const conn = await getConnection();

  try {
    const current = await bloquearAnticipo(
      conn,
      id,
    );

    if (
      String(current.ESTADO ?? '')
        .trim()
        .toUpperCase() === 'CANCELADO'
    ) {
      throw new ConflictError(
        'Este anticipo ya está anulado.',
      );
    }

    const aplicadoResult =
      await conn.execute<{
        TOTAL: number;
      }>(
        `
          SELECT
            NVL(SUM(MONTO_APLICADO), 0) AS TOTAL

          FROM CXC_APLICACION_ANTICIPO

          WHERE ID_ANTICIPO = :id
            AND ESTADO = 'CONFIRMADA'
        `,
        { id },
      );

    if (
      Number(
        aplicadoResult.rows?.[0]?.TOTAL ?? 0,
      ) > 0.005
    ) {
      throw new ConflictError(
        'Este anticipo tiene aplicaciones vigentes; debe reversarlas antes de anularlo.',
      );
    }

    // La anulación conserva su política.
    // No forma parte del bloqueo de fecha
    // de creación solicitado.

    const fechaAnulacion =
      input.fechaAnulacion ?? businessTodayIso();

    if (
      fechaAnulacion > businessTodayIso()
    ) {
      throw new BadRequestError(
        'La fecha de anulación no puede ser futura.',
      );
    }

    if (
      fechaAnulacion < current.FECHA_ISO
    ) {
      throw new BadRequestError(
        'La fecha de anulación no puede ser anterior a la fecha del anticipo.',
      );
    }

    await conn.execute(
      `
        UPDATE CXC_ANTICIPOS

        SET
          MONTO_DISPONIBLE = 0,

          ESTADO = 'CANCELADO',

          ID_EMPLEADO_ANULACION =
            :idEmpleadoAnulacion,

          FECHA_ANULACION =
            TO_DATE(
              :fechaAnulacion,
              'YYYY-MM-DD'
            ),

          MOTIVO_ANULACION =
            :motivoAnulacion

        WHERE ID_ANTICIPO = :id
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
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.close();
  }
}
