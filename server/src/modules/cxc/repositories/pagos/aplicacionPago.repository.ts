import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type { AplicacionPago, CreateAplicacionPagoInput, UpdateAplicacionPagoInput } from '@erp/contracts';
import { BadRequestError, ConflictError } from '../../../../shared/errors/AppError';
import { deriveDocumentoEstado, roundMoney } from '../../shared/financialRules';

interface Row {
  ID_APLICACION: number;
  ID_PAGO: number;
  ID_DOCUMENTO: number;
  FECHA_APLICACION: Date;
  MONTO_APLICADO: number;
  ID_EMPLEADO: number | null;
}

interface PagoLockRow {
  ID_PAGO: number;
  ID_CLIENTE: number;
  MONTO: number;
  ESTADO: string;
}

interface DocumentoLockRow {
  ID_DOCUMENTO: number;
  ID_CLIENTE: number;
  TOTAL: number;
  SALDO: number;
  ESTADO: string;
}

const mapRow = (r: Row): AplicacionPago => ({
  idAplicacion: r.ID_APLICACION,
  idPago: r.ID_PAGO,
  idDocumento: r.ID_DOCUMENTO,
  fechaAplicacion: r.FECHA_APLICACION?.toISOString() ?? '',
  montoAplicado: r.MONTO_APLICADO,
  idEmpleado: r.ID_EMPLEADO,
});

export async function findAll({ page, limit, search }: { page: number; limit: number; search?: string }) {
  const c = await getConnection();
  try {
    const o = (page - 1) * limit;
    const w = search
      ? `WHERE TO_CHAR(ID_APLICACION) LIKE :search OR TO_CHAR(ID_PAGO) LIKE :search OR TO_CHAR(ID_DOCUMENTO) LIKE :search`
      : '';
    const sb = search ? { search: `%${search}%` } : {};
    const d = await c.execute<Row>(
      `SELECT ID_APLICACION,ID_PAGO,ID_DOCUMENTO,FECHA_APLICACION,MONTO_APLICADO,ID_EMPLEADO
         FROM CXC_APLICACION_PAGOS ${w}
        ORDER BY FECHA_APLICACION DESC,ID_APLICACION DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...sb, offset: o, limit },
    );
    const n = await c.execute<{ TOTAL: number }>(`SELECT COUNT(*) TOTAL FROM CXC_APLICACION_PAGOS ${w}`, sb);
    return { data: (d.rows ?? []).map(mapRow), total: n.rows?.[0]?.TOTAL ?? 0 };
  } finally {
    await c.close();
  }
}

export async function findById(id: number) {
  const c = await getConnection();
  try {
    const r = await c.execute<Row>(
      `SELECT ID_APLICACION,ID_PAGO,ID_DOCUMENTO,FECHA_APLICACION,MONTO_APLICADO,ID_EMPLEADO
         FROM CXC_APLICACION_PAGOS WHERE ID_APLICACION=:id`,
      { id },
    );
    return r.rows?.[0] ? mapRow(r.rows[0]) : null;
  } finally {
    await c.close();
  }
}

/**
 * Aplica un pago de forma atómica: bloquea pago + documento, valida disponible,
 * registra la aplicación, actualiza saldo/estado del documento y estado del pago.
 */
export async function create(i: CreateAplicacionPagoInput): Promise<number> {
  const c = await getConnection();
  try {
    const pagoResult = await c.execute<PagoLockRow>(
      `SELECT ID_PAGO, ID_CLIENTE, MONTO, ESTADO
         FROM CXC_PAGOS
        WHERE ID_PAGO = :idPago
        FOR UPDATE`,
      { idPago: i.idPago },
    );
    const pago = pagoResult.rows?.[0];
    if (!pago) throw new BadRequestError('El pago seleccionado no existe');

    const documentoResult = await c.execute<DocumentoLockRow>(
      `SELECT ID_DOCUMENTO, ID_CLIENTE, TOTAL, SALDO, ESTADO
         FROM CXC_DOCUMENTOS
        WHERE ID_DOCUMENTO = :idDocumento
        FOR UPDATE`,
      { idDocumento: i.idDocumento },
    );
    const documento = documentoResult.rows?.[0];
    if (!documento) throw new BadRequestError('El documento seleccionado no existe');

    const pagoEstado = String(pago.ESTADO ?? '').trim().toUpperCase();
    if (['ANULADO', 'REVERSADO'].includes(pagoEstado)) {
      throw new ConflictError('Un pago anulado o reversado no puede aplicarse.');
    }

    const docEstado = String(documento.ESTADO ?? '').trim().toUpperCase();
    if (['PAGADO', 'PAGADA', 'ANULADO', 'ANULADA'].includes(docEstado) || Number(documento.SALDO) <= 0) {
      throw new ConflictError('El documento ya está pagado/anulado o no tiene saldo pendiente.');
    }

    if (pago.ID_CLIENTE !== documento.ID_CLIENTE) {
      throw new BadRequestError('El pago y el documento deben pertenecer al mismo cliente');
    }

    const sumResult = await c.execute<{ TOTAL: number }>(
      `SELECT NVL(SUM(MONTO_APLICADO), 0) TOTAL
         FROM CXC_APLICACION_PAGOS
        WHERE ID_PAGO = :idPago`,
      { idPago: i.idPago },
    );
    const yaAplicado = Number(sumResult.rows?.[0]?.TOTAL ?? 0);
    const disponiblePago = roundMoney(Number(pago.MONTO) - yaAplicado);
    const saldoDocumento = roundMoney(Number(documento.SALDO));
    const montoAplicado = roundMoney(Number(i.montoAplicado));

    if (montoAplicado <= 0) throw new BadRequestError('El monto aplicado debe ser mayor a cero');
    if (montoAplicado > saldoDocumento + 0.005) {
      throw new BadRequestError('El monto aplicado no puede superar el saldo del documento');
    }
    if (montoAplicado > disponiblePago + 0.005) {
      throw new BadRequestError('El monto aplicado no puede superar el monto disponible del pago');
    }

    const insert = await c.execute<{ id: number[] }>(
      `INSERT INTO CXC_APLICACION_PAGOS
         (ID_PAGO,ID_DOCUMENTO,FECHA_APLICACION,MONTO_APLICADO,ID_EMPLEADO)
       VALUES
         (:idPago,:idDocumento,TO_DATE(:fechaAplicacion,'YYYY-MM-DD'),:montoAplicado,:idEmpleado)
       RETURNING ID_APLICACION INTO :id`,
      {
        idPago: i.idPago,
        idDocumento: i.idDocumento,
        fechaAplicacion: i.fechaAplicacion,
        montoAplicado,
        idEmpleado: i.idEmpleado ?? null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
    );

    const nuevoSaldo = Math.max(0, roundMoney(saldoDocumento - montoAplicado));
    const nuevoEstadoDocumento = deriveDocumentoEstado(Number(documento.TOTAL), nuevoSaldo, documento.ESTADO);
    await c.execute(
      `UPDATE CXC_DOCUMENTOS
          SET SALDO = :saldo,
              ESTADO = :estado
        WHERE ID_DOCUMENTO = :idDocumento`,
      { saldo: nuevoSaldo, estado: nuevoEstadoDocumento, idDocumento: i.idDocumento },
    );

    const totalAplicado = roundMoney(yaAplicado + montoAplicado);
    const nuevoEstadoPago = totalAplicado >= Number(pago.MONTO) - 0.005 ? 'APLICADO' : 'EN_CUENTA';
    await c.execute(
      `UPDATE CXC_PAGOS SET ESTADO = :estado WHERE ID_PAGO = :idPago`,
      { estado: nuevoEstadoPago, idPago: i.idPago },
    );

    await c.commit();
    return insert.outBinds!.id[0];
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    await c.close();
  }
}

// Se conservan por compatibilidad de interfaz, pero las operaciones financieras
// confirmadas son inmutables desde el CRUD; el service las bloquea.
export async function update(id: number, i: UpdateAplicacionPagoInput) {
  const f: string[] = [];
  const b: Record<string, any> = { id };
  if (i.idPago !== undefined) { f.push('ID_PAGO=:idPago'); b.idPago = i.idPago; }
  if (i.idDocumento !== undefined) { f.push('ID_DOCUMENTO=:idDocumento'); b.idDocumento = i.idDocumento; }
  if (i.fechaAplicacion !== undefined) { f.push(`FECHA_APLICACION=TO_DATE(:fechaAplicacion,'YYYY-MM-DD')`); b.fechaAplicacion = i.fechaAplicacion; }
  if (i.montoAplicado !== undefined) { f.push('MONTO_APLICADO=:montoAplicado'); b.montoAplicado = i.montoAplicado; }
  if (i.idEmpleado !== undefined) { f.push('ID_EMPLEADO=:idEmpleado'); b.idEmpleado = i.idEmpleado; }
  if (!f.length) return;
  const c = await getConnection();
  try {
    await c.execute(`UPDATE CXC_APLICACION_PAGOS SET ${f.join(',')} WHERE ID_APLICACION=:id`, b);
    await c.commit();
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    await c.close();
  }
}

export async function remove(id: number) {
  const c = await getConnection();
  try {
    await c.execute(`DELETE FROM CXC_APLICACION_PAGOS WHERE ID_APLICACION=:id`, { id });
    await c.commit();
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    await c.close();
  }
}

export async function sumAplicadoPorPago(idPago: number, excludeId?: number): Promise<number> {
  const c = await getConnection();
  try {
    const result = await c.execute<{ TOTAL: number }>(
      `SELECT NVL(SUM(MONTO_APLICADO), 0) AS TOTAL
         FROM CXC_APLICACION_PAGOS
        WHERE ID_PAGO = :idPago
          AND (:excludeId IS NULL OR ID_APLICACION <> :excludeId)`,
      { idPago, excludeId: excludeId ?? null },
    );
    return Number(result.rows?.[0]?.TOTAL ?? 0);
  } finally {
    await c.close();
  }
}
