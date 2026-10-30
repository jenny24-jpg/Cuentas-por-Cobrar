
import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import { businessTodayIso } from '../../../../shared/date';

import type {
  Pago,
  CreatePagoInput,
  UpdatePagoInput,
  AnularPagoInput,
  AplicacionNuevoPago,
} from '@erp/contracts';

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../../shared/errors/AppError';

import { siguienteReferenciaPago } from '../../shared/correlativos';
import { aplicarEnConexion } from './aplicacionPago.repository';
import { crearEnConexion as crearAnticipoEnConexion } from './anticipo.repository';

// =====================================================
// INTERFAZ DE RESULTADOS ORACLE
// =====================================================

interface Row {
  ID_PAGO: number;
  ID_CLIENTE: number;
  NOMBRE_CLIENTE: string | null;
  ID_FORMA_PAGO: number;
  ID_MONEDA: number;
  ID_BANCO: number | null;
  NOMBRE_BANCO: string | null;

  FECHA_PAGO_ISO: string;

  MONTO: number;
  MONTO_APLICADO: number;
  MONTO_DISPONIBLE: number;
  NUMERO_REFERENCIA: string | null;
  ESTADO: string;

  ID_EMPLEADO_ANULACION: number | null;
  NOMBRE_EMPLEADO_ANULACION: string | null;
  FECHA_ANULACION_ISO: string | null;
  MOTIVO_ANULACION: string | null;
}

// =====================================================
// MAPEO DE RESULTADOS
// =====================================================

const mapRow = (r: Row): Pago => ({
  idPago: r.ID_PAGO,
  idCliente: r.ID_CLIENTE,
  nombreCliente: r.NOMBRE_CLIENTE,
  idFormaPago: r.ID_FORMA_PAGO,
  idMoneda: r.ID_MONEDA,
  idBanco: r.ID_BANCO,
  nombreBanco: r.NOMBRE_BANCO,

  // Conserva el día almacenado en Oracle.
  fechaPago: r.FECHA_PAGO_ISO,

  monto: r.MONTO,
  montoAplicado: Number(r.MONTO_APLICADO ?? 0),
  montoDisponible: Number(
    r.MONTO_DISPONIBLE ?? r.MONTO,
  ),

  numeroReferencia: r.NUMERO_REFERENCIA,
  estado: r.ESTADO,

  idEmpleadoAnulacion: r.ID_EMPLEADO_ANULACION,
  nombreEmpleadoAnulacion: r.NOMBRE_EMPLEADO_ANULACION,
  fechaAnulacion: r.FECHA_ANULACION_ISO,
  motivoAnulacion: r.MOTIVO_ANULACION,
});

// =====================================================
// CONSULTA BASE
// =====================================================

const SELECT_BASE = `
  SELECT
    p.ID_PAGO,
    p.ID_CLIENTE,
    c.NOMBRE AS NOMBRE_CLIENTE,
    p.ID_FORMA_PAGO,
    p.ID_MONEDA,
    p.ID_BANCO,
    b.NOMBRE AS NOMBRE_BANCO,

    TO_CHAR(
      p.FECHA_PAGO,
      'YYYY-MM-DD'
    ) AS FECHA_PAGO_ISO,

    p.MONTO,

    NVL(
      (
        SELECT SUM(a.MONTO_APLICADO)
        FROM CXC_APLICACION_PAGOS a
        WHERE a.ID_PAGO = p.ID_PAGO
          AND a.ESTADO = 'CONFIRMADA'
      ),
      0
    ) + NVL(
      (
        SELECT MAX(ant.MONTO_ORIGINAL)
        FROM CXC_ANTICIPOS ant
        WHERE ant.ID_PAGO = p.ID_PAGO
          AND ant.ESTADO <> 'CANCELADO'
      ),
      0
    ) AS MONTO_APLICADO,

    GREATEST(
      p.MONTO - NVL(
        (
          SELECT SUM(a.MONTO_APLICADO)
          FROM CXC_APLICACION_PAGOS a
          WHERE a.ID_PAGO = p.ID_PAGO
            AND a.ESTADO = 'CONFIRMADA'
        ),
        0
      ) - NVL(
        (
          SELECT MAX(ant.MONTO_ORIGINAL)
          FROM CXC_ANTICIPOS ant
          WHERE ant.ID_PAGO = p.ID_PAGO
            AND ant.ESTADO <> 'CANCELADO'
        ),
        0
      ) - NVL(
        (
          SELECT SUM(ap.MONTO_APLICADO)
          FROM CXC_APLICACION_PAGOS ap
          WHERE ap.ID_PAGO = p.ID_PAGO
            AND ap.ESTADO = 'PENDIENTE'
        ),
        0
      ),
      0
    ) AS MONTO_DISPONIBLE,

    p.NUMERO_REFERENCIA,
    CASE
      WHEN UPPER(NVL(p.ESTADO, '')) = 'ANULADO' THEN p.ESTADO
      WHEN EXISTS (
        SELECT 1
        FROM CXC_ANTICIPOS ant
        WHERE ant.ID_PAGO = p.ID_PAGO
          AND ant.ESTADO <> 'CANCELADO'
      ) THEN 'APLICADO'
      ELSE p.ESTADO
    END AS ESTADO,
    p.ID_EMPLEADO_ANULACION,

    CASE
      WHEN ea.ID_EMPLEADO IS NULL THEN NULL
      ELSE TRIM(
        ea.NOMBRE || ' ' || NVL(ea.APELLIDO, '')
      )
    END AS NOMBRE_EMPLEADO_ANULACION,

    TO_CHAR(
      p.FECHA_ANULACION,
      'YYYY-MM-DD'
    ) AS FECHA_ANULACION_ISO,

    p.MOTIVO_ANULACION

  FROM CXC_PAGOS p

  LEFT JOIN CLIENTE c
    ON c.ID_CLIENTE = p.ID_CLIENTE

  LEFT JOIN MB_BANCO b
    ON b.BANCO_ID = p.ID_BANCO

  LEFT JOIN EMPLEADO ea
    ON ea.ID_EMPLEADO = p.ID_EMPLEADO_ANULACION
`;

// =====================================================
// LISTAR PAGOS
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
  const c = await getConnection();

  try {
    const offset = (page - 1) * limit;

    const where = search
      ? `
        WHERE UPPER(
          NVL(p.NUMERO_REFERENCIA, '')
        ) LIKE UPPER(:search)

        OR UPPER(
          NVL(p.ESTADO, '')
        ) LIKE UPPER(:search)

        OR UPPER(
          NVL(c.NOMBRE, '')
        ) LIKE UPPER(:search)

        OR TO_CHAR(p.ID_PAGO) LIKE :search
      `
      : '';

    const sb = search
      ? { search: `%${search}%` }
      : {};

    const data = await c.execute<Row>(
      `
        ${SELECT_BASE}
        ${where}

        ORDER BY
          p.FECHA_PAGO DESC,
          p.ID_PAGO DESC

        OFFSET :offset ROWS
        FETCH NEXT :limit ROWS ONLY
      `,
      {
        ...sb,
        offset,
        limit,
      },
    );

    const cnt = await c.execute<{
      TOTAL: number;
    }>(
      `
        SELECT COUNT(*) AS TOTAL

        FROM CXC_PAGOS p

        LEFT JOIN CLIENTE c
          ON c.ID_CLIENTE = p.ID_CLIENTE

        ${where}
      `,
      sb,
    );

    return {
      data: (data.rows ?? []).map(mapRow),
      total: cnt.rows?.[0]?.TOTAL ?? 0,
    };
  } finally {
    await c.close();
  }
}

// =====================================================
// CONSULTAR PAGO POR ID
// =====================================================

export async function findById(id: number) {
  const c = await getConnection();

  try {
    const r = await c.execute<Row>(
      `
        ${SELECT_BASE}
        WHERE p.ID_PAGO = :id
      `,
      { id },
    );

    return r.rows?.[0]
      ? mapRow(r.rows[0])
      : null;
  } finally {
    await c.close();
  }
}

// =====================================================
// CREAR PAGO
// =====================================================

/** Referencia que tendría hoy el próximo pago (vista previa, sin bloquear). */
export async function previewReferencia(): Promise<string> {
  const c = await getConnection();
  try {
    return await siguienteReferenciaPago(c, { bloquear: false });
  } finally {
    await c.close();
  }
}

/**
 * Registra el pago con su referencia automática y, en la misma transacción, su
 * destino: lo reparte entre las facturas indicadas (cada aplicación baja el
 * saldo, cambia estados, registra historial y emite su recibo) o crea el anticipo
 * que respalda. Si algo falla no queda nada: ni pago suelto ni aplicación a medias.
 */
export async function create(
  i: CreatePagoInput,
  destino: {
    aplicaciones?: AplicacionNuevoPago[];
    idEmpleado?: number;
    comoAnticipo?: boolean;
  } = {},
) {
  const c = await getConnection();

  try {
    const hoy = businessTodayIso();

    // Un pago nuevo únicamente puede registrarse
    // con la fecha actual de Guatemala.
    //
    // También se valida en el servicio.
    // Esta segunda protección evita que otras
    // llamadas al repositorio omitan la regla.

    if (i.fechaPago !== hoy) {
      throw new BadRequestError(
        'La fecha de pago debe ser la fecha actual del sistema (Guatemala). No se permiten fechas anteriores ni futuras.',
      );
    }

    // Correlativo automático (bloquea CXC_PAGOS hasta el commit).
    const numeroReferencia = await siguienteReferenciaPago(c);

    const r = await c.execute<{
      id: number[];
    }>(
      `
        INSERT INTO CXC_PAGOS (
          ID_CLIENTE,
          ID_FORMA_PAGO,
          ID_MONEDA,
          ID_BANCO,
          FECHA_PAGO,
          MONTO,
          NUMERO_REFERENCIA,
          ESTADO
        )
        VALUES (
          :idCliente,
          :idFormaPago,
          :idMoneda,
          :idBanco,
          TO_DATE(:fechaPago, 'YYYY-MM-DD'),
          :monto,
          :numeroReferencia,
          :estado
        )

        RETURNING ID_PAGO INTO :id
      `,
      {
        idCliente: i.idCliente,
        idFormaPago: i.idFormaPago,
        idMoneda: i.idMoneda,
        idBanco: i.idBanco ?? null,

        // Fecha calculada por el backend.
        fechaPago: hoy,

        monto: i.monto,
        numeroReferencia,
        estado: i.estado ?? 'NO_APLICADO',

        id: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER,
        },
      },
    );

    const id = r.outBinds!.id[0];

    // Siempre en el mismo orden (por documento) para que dos pagos simultáneos
    // del mismo cliente no se bloqueen entre sí.
    const aplicaciones = [...(destino.aplicaciones ?? [])]
      .sort((a, b) => a.idDocumento - b.idDocumento);

    for (const aplicacion of aplicaciones) {
      await aplicarEnConexion(c, {
        idPago: id,
        idDocumento: aplicacion.idDocumento,
        fechaAplicacion: hoy,
        montoAplicado: aplicacion.montoAplicado,
        idEmpleado: destino.idEmpleado!,
      });
    }

    if (destino.comoAnticipo) {
      await crearAnticipoEnConexion(c, {
        idCliente: i.idCliente,
        idPago: id,
      });
    }

    await c.commit();

    return id;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    await c.close();
  }
}

// =====================================================
// VALIDAR ANTICIPOS ASOCIADOS
// =====================================================

/**
 * Un pago que respalda un anticipo vigente
 * no puede editarse, eliminarse ni anularse.
 */
async function assertSinAnticipoVigente(
  c: oracledb.Connection,
  id: number,
): Promise<void> {
  const r = await c.execute<{
    TOTAL: number;
  }>(
    `
      SELECT COUNT(*) AS TOTAL
      FROM CXC_ANTICIPOS
      WHERE ID_PAGO = :id
        AND ESTADO <> 'CANCELADO'
    `,
    { id },
  );

  if (
    Number(r.rows?.[0]?.TOTAL ?? 0) > 0
  ) {
    throw new ConflictError(
      'Este pago respalda un anticipo vigente. Anula primero el anticipo.',
    );
  }
}

// =====================================================
// BLOQUEAR Y VALIDAR PAGO
// =====================================================

/**
 * Bloquea el pago con FOR UPDATE y verifica
 * que no tenga aplicaciones confirmadas ni
 * anticipos vigentes.
 */
async function lockYValidarSinAplicaciones(
  c: oracledb.Connection,
  id: number,
  mensajeSiAplicado: string,
): Promise<{ ESTADO: string }> {
  const lockResult = await c.execute<{
    ESTADO: string;
  }>(
    `
      SELECT ESTADO
      FROM CXC_PAGOS
      WHERE ID_PAGO = :id
      FOR UPDATE
    `,
    { id },
  );

  const row = lockResult.rows?.[0];

  if (!row) {
    throw new NotFoundError(
      `Pago ${id} no encontrado`,
    );
  }

  const estadoActual = String(
    row.ESTADO ?? '',
  ).trim().toUpperCase();

  if (
    [
      'ANULADO',
      'REVERSADO',
      'APLICADO',
    ].includes(estadoActual)
  ) {
    throw new ConflictError(
      'El pago está anulado, reversado o aplicado y no puede modificarse directamente.',
    );
  }

  const sumResult = await c.execute<{
    TOTAL: number;
  }>(
    `
      SELECT
        NVL(SUM(MONTO_APLICADO), 0) AS TOTAL

      FROM CXC_APLICACION_PAGOS

      WHERE ID_PAGO = :id
        AND ESTADO = 'CONFIRMADA'
    `,
    { id },
  );

  if (
    Number(
      sumResult.rows?.[0]?.TOTAL ?? 0,
    ) > 0.005
  ) {
    throw new ConflictError(
      mensajeSiAplicado,
    );
  }

  await assertSinAnticipoVigente(c, id);

  return row;
}

// =====================================================
// ACTUALIZAR PAGO
// =====================================================

export async function update(
  id: number,
  i: UpdatePagoInput,
) {
  // La fecha de un pago registrado es inmutable.
  // El servicio debe omitir fechaPago al hacer PATCH.
  // Se bloquea cualquier intento directo de
  // actualizarla desde el repositorio.

  if (i.fechaPago !== undefined) {
    throw new BadRequestError(
      'La fecha de un pago registrado no puede modificarse.',
    );
  }

  const f: string[] = [];

  const b: Record<string, any> = {
    id,
  };

  if (i.idCliente !== undefined) {
    f.push('ID_CLIENTE=:idCliente');
    b.idCliente = i.idCliente;
  }

  if (i.idFormaPago !== undefined) {
    f.push('ID_FORMA_PAGO=:idFormaPago');
    b.idFormaPago = i.idFormaPago;
  }

  if (i.idMoneda !== undefined) {
    f.push('ID_MONEDA=:idMoneda');
    b.idMoneda = i.idMoneda;
  }

  if (i.idBanco !== undefined) {
    f.push('ID_BANCO=:idBanco');
    b.idBanco = i.idBanco;
  }

  // FECHA_PAGO no forma parte del UPDATE.

  if (i.monto !== undefined) {
    f.push('MONTO=:monto');
    b.monto = i.monto;
  }

  if (i.estado !== undefined) {
    f.push('ESTADO=:estado');
    b.estado = i.estado;
  }

  if (!f.length) {
    return;
  }

  const c = await getConnection();

  try {
    // Se conserva el bloqueo transaccional
    // y la protección de anticipos vigentes.
    await lockYValidarSinAplicaciones(
      c,
      id,
      'El pago ya tiene aplicaciones y no puede editarse directamente. Primero debe reversarse la aplicación.',
    );

    await c.execute(
      `
        UPDATE CXC_PAGOS
        SET ${f.join(', ')}
        WHERE ID_PAGO = :id
      `,
      b,
    );

    await c.commit();
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    await c.close();
  }
}

// =====================================================
// ELIMINAR PAGO
// =====================================================

export async function remove(id: number) {
  const c = await getConnection();

  try {
    const row =
      await lockYValidarSinAplicaciones(
        c,
        id,
        'Un pago con aplicaciones no se elimina. Debe reversarse para conservar trazabilidad.',
      );

    const estado = String(
      row.ESTADO ?? '',
    ).trim().toUpperCase();

    if (
      ![
        'NO_IDENTIFICADO',
        'NO_APLICADO',
      ].includes(estado)
    ) {
      throw new ConflictError(
        'Solo pagos sin aplicar pueden eliminarse físicamente. Los demás deben anularse/reversarse.',
      );
    }

    // Comprobar registros dependientes.
    const dep = await c.execute<{
      RECIBOS: number;
      ANTICIPOS: number;
    }>(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM CXC_RECIBOS
            WHERE ID_PAGO = :id
          ) AS RECIBOS,

          (
            SELECT COUNT(*)
            FROM CXC_ANTICIPOS
            WHERE ID_PAGO = :id
          ) AS ANTICIPOS

        FROM DUAL
      `,
      { id },
    );

    const recibos = Number(
      dep.rows?.[0]?.RECIBOS ?? 0,
    );

    const anticipos = Number(
      dep.rows?.[0]?.ANTICIPOS ?? 0,
    );

    if (recibos > 0 || anticipos > 0) {
      const partes = [
        recibos > 0
          ? `${recibos} recibo(s)`
          : '',

        anticipos > 0
          ? `${anticipos} anticipo(s)`
          : '',
      ]
        .filter(Boolean)
        .join(' y ');

      throw new ConflictError(
        `No se puede eliminar el pago: tiene ${partes} asociado(s). Elimina o anula primero esos registros, o anula el pago para conservar la trazabilidad.`,
      );
    }

    await c.execute(
      `
        DELETE FROM CXC_PAGOS
        WHERE ID_PAGO = :id
      `,
      { id },
    );

    await c.commit();
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    await c.close();
  }
}

// =====================================================
// OPCIONES DE PAGOS DISPONIBLES
// =====================================================

/**
 * Consulta pagos que tienen monto disponible.
 *
 * Cuando paraAnticipo=true, se excluyen pagos
 * con aplicaciones confirmadas y pagos que
 * ya respaldan un anticipo vigente.
 */
export async function listOptions(
  idCliente?: number,
  opciones: {
    paraAnticipo?: boolean;
    // Solo pagos libres para aplicar a facturas: sin anticipo vigente
    // (ese dinero se usa desde Aplicación de anticipo, no dos veces).
    libres?: boolean;
  } = {},
) {
  const c = await getConnection();

  try {
    const condiciones = [
      ...(idCliente
        ? ['p.ID_CLIENTE = :idCliente']
        : []),

      `NOT EXISTS (
        SELECT 1
        FROM CXC_ANTICIPOS ant
        WHERE ant.ID_PAGO = p.ID_PAGO
          AND ant.ESTADO <> 'CANCELADO'
      )`,

      ...(opciones.libres && !opciones.paraAnticipo
        ? [
            `NOT EXISTS (
              SELECT 1
              FROM CXC_ANTICIPOS ant
              WHERE ant.ID_PAGO = p.ID_PAGO
                AND ant.ESTADO <> 'CANCELADO'
            )`,
          ]
        : []),

      ...(opciones.paraAnticipo
        ? [
            `NOT EXISTS (
              SELECT 1
              FROM CXC_APLICACION_PAGOS x
              WHERE x.ID_PAGO = p.ID_PAGO
                AND x.ESTADO IN ('CONFIRMADA', 'PENDIENTE')
            )`,

            `NOT EXISTS (
              SELECT 1
              FROM CXC_ANTICIPOS ant
              WHERE ant.ID_PAGO = p.ID_PAGO
                AND ant.ESTADO <> 'CANCELADO'
            )`,
          ]
        : []),
    ];

    const where = condiciones.length
      ? `WHERE ${condiciones.join(' AND ')}`
      : '';

    const r = await c.execute<{
      ID_PAGO: number;
      ID_CLIENTE: number;
      CLIENTE: string;
      NUMERO_REFERENCIA: string | null;
      FORMA_PAGO: string | null;
      FECHA: string;
      MONTO: number;
      DISPONIBLE: number;
      ESTADO: string;
    }>(
      `
        SELECT
          p.ID_PAGO,
          p.ID_CLIENTE,

          'CR-' ||
          LPAD(p.ID_CLIENTE, 5, '0') ||
          ' ' ||
          cl.NOMBRE AS CLIENTE,

          p.NUMERO_REFERENCIA,
          fp.NOMBRE AS FORMA_PAGO,

          TO_CHAR(
            p.FECHA_PAGO,
            'DD/MM/YYYY'
          ) AS FECHA,

          p.MONTO,

          GREATEST(
            p.MONTO - NVL(SUM(a.MONTO_APLICADO), 0),
            0
          ) AS DISPONIBLE,

          p.ESTADO

        FROM CXC_PAGOS p

        JOIN CLIENTE cl
          ON cl.ID_CLIENTE = p.ID_CLIENTE

        LEFT JOIN CXC_FORMAS_PAGO fp
          ON fp.ID_FORMA_PAGO = p.ID_FORMA_PAGO

        LEFT JOIN CXC_APLICACION_PAGOS a
          ON a.ID_PAGO = p.ID_PAGO
         AND a.ESTADO IN ('CONFIRMADA', 'PENDIENTE')

        ${where}

        GROUP BY
          p.ID_PAGO,
          p.ID_CLIENTE,
          cl.NOMBRE,
          p.NUMERO_REFERENCIA,
          fp.NOMBRE,
          p.FECHA_PAGO,
          p.MONTO,
          p.ESTADO

        HAVING
          GREATEST(
            p.MONTO - NVL(SUM(a.MONTO_APLICADO), 0),
            0
          ) > 0

          AND UPPER(
            NVL(p.ESTADO, 'NO_APLICADO')
          ) NOT IN (
            'ANULADO',
            'REVERSADO'
          )

        ORDER BY p.ID_PAGO DESC
      `,
      idCliente ? { idCliente } : {},
    );

    return (r.rows ?? []).map((x) => ({
      id: x.ID_PAGO,
      idCliente: x.ID_CLIENTE,

      label:
        `${x.NUMERO_REFERENCIA ?? `Pago #${x.ID_PAGO}`}` +
        ` · ${x.FECHA}` +
        `${x.FORMA_PAGO ? ` · ${x.FORMA_PAGO}` : ''}` +
        ` · disponible Q ${Number(x.DISPONIBLE).toFixed(2)}`,

      cliente: x.CLIENTE,
      monto: x.MONTO,
      saldo: x.DISPONIBLE,
      estado: x.ESTADO,
    }));
  } finally {
    await c.close();
  }
}

// =====================================================
// ANULACIÓN FORMAL DE PAGO
// =====================================================

/**
 * Anula un pago sin aplicaciones confirmadas.
 *
 * Mantiene la trazabilidad:
 * - Empleado responsable.
 * - Fecha de anulación.
 * - Motivo de anulación.
 *
 * Los pagos que respaldan anticipos vigentes
 * no pueden anularse.
 */
export async function anular(
  id: number,
  input: AnularPagoInput,
): Promise<void> {
  const c = await getConnection();

  try {
    const result = await c.execute<{
      ESTADO: string;
    }>(
      `
        SELECT ESTADO
        FROM CXC_PAGOS
        WHERE ID_PAGO = :id
        FOR UPDATE
      `,
      { id },
    );

    const row = result.rows?.[0];

    if (!row) {
      throw new NotFoundError(
        `Pago ${id} no encontrado`,
      );
    }

    const estadoActual = String(
      row.ESTADO ?? '',
    ).trim().toUpperCase();

    if (estadoActual === 'ANULADO') {
      throw new ConflictError(
        'Este pago ya está anulado.',
      );
    }

    if (estadoActual === 'REVERSADO') {
      throw new ConflictError(
        'Un pago reversado no puede anularse nuevamente.',
      );
    }

    // Verificar aplicaciones confirmadas.
    const aplicadoResult = await c.execute<{
      TOTAL: number;
    }>(
      `
        SELECT
          NVL(SUM(MONTO_APLICADO), 0) AS TOTAL

        FROM CXC_APLICACION_PAGOS

        WHERE ID_PAGO = :id
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
        'Este pago tiene aplicaciones vigentes. Reversa cada aplicación antes de anularlo.',
      );
    }

    // Un pago con anticipo vigente
    // tampoco puede anularse.
    await assertSinAnticipoVigente(c, id);

    // Se conserva la política actual:
    // la fecha de anulación no puede ser futura.
    //
    // No cambiamos aquí el formulario ni la
    // política de fechas de anulación.

    if (
      input.fechaAnulacion &&
      input.fechaAnulacion > businessTodayIso()
    ) {
      throw new BadRequestError(
        'La fecha de anulación no puede ser futura.',
      );
    }

    await c.execute(
      `
        UPDATE CXC_PAGOS

        SET
          ESTADO = 'ANULADO',

          ID_EMPLEADO_ANULACION =
            :idEmpleadoAnulacion,

          FECHA_ANULACION = NVL(
            TO_DATE(
              :fechaAnulacion,
              'YYYY-MM-DD'
            ),
            SYSDATE
          ),

          MOTIVO_ANULACION =
            :motivoAnulacion

        WHERE ID_PAGO = :id
      `,
      {
        idEmpleadoAnulacion:
          input.idEmpleadoAnulacion,

        fechaAnulacion:
          input.fechaAnulacion ?? null,

        motivoAnulacion:
          input.motivoAnulacion,

        id,
      },
    );

    await c.commit();
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    await c.close();
  }
}
