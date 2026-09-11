import type { Connection } from 'oracledb';
import { getConnection } from '../../../../config/database';
import type { ConvenioCuota, UpdateConvenioCuotaInput } from '@erp/contracts';
import { BadRequestError, NotFoundError } from '../../../../shared/errors/AppError';

interface ConvenioCuotaRow {
  ID_CUOTA: number;
  ID_CONVENIO: number;
  NUMERO_CUOTA: number;
  FECHA_VENCIMIENTO: Date;
  MONTO: number;
  SALDO: number;
  ESTADO: string;
  ID_FORMA_PAGO: number | null;
  NOMBRE_FORMA_PAGO: string | null;
  REFERENCIA_PAGO: string | null;
}

function mapRow(row: ConvenioCuotaRow): ConvenioCuota {
  return {
    idCuota: row.ID_CUOTA,
    idConvenio: row.ID_CONVENIO,
    numeroCuota: row.NUMERO_CUOTA,
    fechaVencimiento: row.FECHA_VENCIMIENTO?.toISOString() ?? '',
    monto: row.MONTO,
    saldo: row.SALDO,
    estado: row.ESTADO as ConvenioCuota['estado'],
    idFormaPago: row.ID_FORMA_PAGO,
    nombreFormaPago: row.NOMBRE_FORMA_PAGO,
    referenciaPago: row.REFERENCIA_PAGO,
  };
}

const SELECT_BASE = `
  SELECT cc.ID_CUOTA, cc.ID_CONVENIO, cc.NUMERO_CUOTA, cc.FECHA_VENCIMIENTO,
         cc.MONTO, cc.SALDO, cc.ESTADO, cc.ID_FORMA_PAGO,
         fp.NOMBRE AS NOMBRE_FORMA_PAGO, cc.REFERENCIA_PAGO
  FROM CXC_CONVENIO_CUOTAS cc
  LEFT JOIN CXC_FORMAS_PAGO fp ON fp.ID_FORMA_PAGO = cc.ID_FORMA_PAGO
`;
// LEFT JOIN (no JOIN normal): las cuotas que todavía no se han pagado no
// tienen ID_FORMA_PAGO, y aun así deben aparecer en el listado.

export async function findByConvenio(idConvenio: number): Promise<ConvenioCuota[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<ConvenioCuotaRow>(
      `${SELECT_BASE} WHERE cc.ID_CONVENIO = :idConvenio ORDER BY cc.NUMERO_CUOTA ASC`,
      { idConvenio },
    );
    return (result.rows ?? []).map(mapRow);
  } finally {
    await conn.close();
  }
}

export async function findById(id: number): Promise<ConvenioCuota | null> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<ConvenioCuotaRow>(
      `${SELECT_BASE} WHERE cc.ID_CUOTA = :id`,
      { id },
    );
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

/**
 * Inserta un lote de cuotas para un convenio, todas en la misma transacción
 * (una sola conexión, un solo commit). Se usa al crear un convenio nuevo:
 * ver services/cobranza/convenioPago.service.ts -> generarPlanDeCuotas().
 */
export async function bulkCreate(
  idConvenio: number,
  cuotas: Array<{ numeroCuota: number; fechaVencimiento: string; monto: number }>,
): Promise<void> {
  const conn: Connection = await getConnection();
  try {
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
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

export async function update(id: number, input: UpdateConvenioCuotaInput): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, any> = { id };

  if (input.fechaVencimiento !== undefined) { fields.push(`FECHA_VENCIMIENTO = TO_DATE(:fechaVencimiento, 'YYYY-MM-DD')`); binds.fechaVencimiento = input.fechaVencimiento; }
  if (input.monto !== undefined) { fields.push('MONTO = :monto'); binds.monto = input.monto; }
  if (input.saldo !== undefined) { fields.push('SALDO = :saldo'); binds.saldo = input.saldo; }
  if (input.estado !== undefined) { fields.push('ESTADO = :estado'); binds.estado = input.estado; }

  if (fields.length === 0) return;

  const conn = await getConnection();
  try {
    await conn.execute(`UPDATE CXC_CONVENIO_CUOTAS SET ${fields.join(', ')} WHERE ID_CUOTA = :id`, binds);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

/**
 * Registra un abono a la cuota: reduce el saldo, guarda con qué forma de
 * pago y referencia se hizo, y si el saldo llega a 0 la marca PAGADA
 * automáticamente. Devuelve la cuota actualizada (con el nombre de la
 * forma de pago ya incluido, vía findById).
 */
export async function registrarPago(
  id: number,
  montoPagado: number,
  idFormaPago: number,
  referenciaPago: string | undefined,
): Promise<ConvenioCuota> {
  const conn = await getConnection();
  try {
    const current = await conn.execute<{ SALDO: number; ESTADO: string }>(
      `SELECT SALDO, ESTADO FROM CXC_CONVENIO_CUOTAS WHERE ID_CUOTA = :id FOR UPDATE`,
      { id },
    );
    const row = current.rows?.[0];
    if (!row) {
      throw new NotFoundError(`Cuota ${id} no encontrada`);
    }

    const saldoActual = Number(row.SALDO);
    if (saldoActual <= 0 || row.ESTADO === 'PAGADA') {
      throw new BadRequestError('La cuota ya está pagada');
    }
    if (montoPagado > saldoActual) {
      throw new BadRequestError('El monto pagado no puede superar el saldo de la cuota');
    }

    const nuevoSaldo = Math.round((saldoActual - montoPagado) * 100) / 100;
    const nuevoEstado = nuevoSaldo === 0 ? 'PAGADA' : row.ESTADO;

    await conn.execute(
      `UPDATE CXC_CONVENIO_CUOTAS
       SET SALDO = :saldo, ESTADO = :estado, ID_FORMA_PAGO = :idFormaPago, REFERENCIA_PAGO = :referenciaPago
       WHERE ID_CUOTA = :id`,
      {
        saldo: nuevoSaldo,
        estado: nuevoEstado,
        idFormaPago,
        referenciaPago: referenciaPago ?? null,
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

  // Se recarga completa (con JOIN a CXC_FORMAS_PAGO) para devolver el
  // nombre real de la forma de pago, no solo el ID.
  const conn2 = await getConnection();
  try {
    const result = await conn2.execute<ConvenioCuotaRow>(`${SELECT_BASE} WHERE cc.ID_CUOTA = :id`, { id });
    return mapRow(result.rows![0]);
  } finally {
    await conn2.close();
  }
}