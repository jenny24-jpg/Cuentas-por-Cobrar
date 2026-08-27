import type { Connection } from 'oracledb';
import { getConnection } from '../../../../config/database';
import type { ConvenioCuota, UpdateConvenioCuotaInput } from '@erp/contracts';

interface ConvenioCuotaRow {
  ID_CUOTA: number;
  ID_CONVENIO: number;
  NUMERO_CUOTA: number;
  FECHA_VENCIMIENTO: Date;
  MONTO: number;
  SALDO: number;
  ESTADO: string;
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
  };
}

export async function findByConvenio(idConvenio: number): Promise<ConvenioCuota[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<ConvenioCuotaRow>(
      `SELECT ID_CUOTA, ID_CONVENIO, NUMERO_CUOTA, FECHA_VENCIMIENTO, MONTO, SALDO, ESTADO
       FROM CXC_CONVENIO_CUOTAS
       WHERE ID_CONVENIO = :idConvenio
       ORDER BY NUMERO_CUOTA ASC`,
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
      `SELECT ID_CUOTA, ID_CONVENIO, NUMERO_CUOTA, FECHA_VENCIMIENTO, MONTO, SALDO, ESTADO
       FROM CXC_CONVENIO_CUOTAS WHERE ID_CUOTA = :id`,
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
 * ver services/cobranza/convenioPago.service.ts -> generarCuotas().
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
 * Registra un abono a la cuota: reduce el saldo y, si llega a 0, la marca
 * PAGADA automáticamente. Devuelve la cuota actualizada.
 */
export async function registrarPago(id: number, montoPagado: number): Promise<ConvenioCuota> {
  const conn = await getConnection();
  try {
    const current = await conn.execute<ConvenioCuotaRow>(
      `SELECT ID_CUOTA, ID_CONVENIO, NUMERO_CUOTA, FECHA_VENCIMIENTO, MONTO, SALDO, ESTADO
       FROM CXC_CONVENIO_CUOTAS WHERE ID_CUOTA = :id FOR UPDATE`,
      { id },
    );
    const row = current.rows?.[0];
    if (!row) {
      throw Object.assign(new Error(`Cuota ${id} no encontrada`), { name: 'NotFoundError' });
    }

    const nuevoSaldo = Math.max(0, Number(row.SALDO) - montoPagado);
    const nuevoEstado = nuevoSaldo === 0 ? 'PAGADA' : row.ESTADO;

    await conn.execute(
      `UPDATE CXC_CONVENIO_CUOTAS SET SALDO = :saldo, ESTADO = :estado WHERE ID_CUOTA = :id`,
      { saldo: nuevoSaldo, estado: nuevoEstado, id },
    );
    await conn.commit();

    return mapRow({ ...row, SALDO: nuevoSaldo, ESTADO: nuevoEstado });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}
