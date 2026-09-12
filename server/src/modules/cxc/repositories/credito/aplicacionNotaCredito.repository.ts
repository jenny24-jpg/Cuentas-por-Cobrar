import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type {
  AplicacionNotaCredito,
  CreateAplicacionNotaCreditoInput,
  UpdateAplicacionNotaCreditoInput,
} from '@erp/contracts';
import { BadRequestError, ConflictError } from '../../../../shared/errors/AppError';
import { deriveDocumentoEstado, roundMoney } from '../../shared/financialRules';

interface AplicacionNotaCreditoRow {
  ID_APLICACION_NC: number;
  ID_NOTA_CREDITO: number;
  ID_DOCUMENTO: number;
  MONTO_APLICADO: number;
  FECHA_APLICACION: Date;
}

interface NotaLockRow {
  ID_NOTA_CREDITO: number;
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

const mapRow = (row: AplicacionNotaCreditoRow): AplicacionNotaCredito => ({
  idAplicacionNc: row.ID_APLICACION_NC,
  idNotaCredito: row.ID_NOTA_CREDITO,
  idDocumento: row.ID_DOCUMENTO,
  montoAplicado: row.MONTO_APLICADO,
  fechaAplicacion: row.FECHA_APLICACION?.toISOString() ?? '',
});

const SELECT_BASE = `
  SELECT ID_APLICACION_NC,
         ID_NOTA_CREDITO,
         ID_DOCUMENTO,
         MONTO_APLICADO,
         FECHA_APLICACION
    FROM CXC_APLICACION_NOTA_CREDITO
`;

export async function findAll(params: { page: number; limit: number; search?: string }) {
  const conn = await getConnection();
  try {
    const offset = (params.page - 1) * params.limit;
    const whereClause = params.search
      ? `WHERE TO_CHAR(ID_APLICACION_NC) LIKE :search
          OR TO_CHAR(ID_NOTA_CREDITO) LIKE :search
          OR TO_CHAR(ID_DOCUMENTO) LIKE :search`
      : '';
    const searchBind = params.search ? { search: `%${params.search}%` } : {};

    const dataResult = await conn.execute<AplicacionNotaCreditoRow>(
      `${SELECT_BASE}
       ${whereClause}
       ORDER BY FECHA_APLICACION DESC, ID_APLICACION_NC DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...searchBind, offset, limit: params.limit },
    );
    const countResult = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) TOTAL FROM CXC_APLICACION_NOTA_CREDITO ${whereClause}`,
      searchBind,
    );
    return { data: (dataResult.rows ?? []).map(mapRow), total: countResult.rows?.[0]?.TOTAL ?? 0 };
  } finally {
    await conn.close();
  }
}

export async function findById(id: number): Promise<AplicacionNotaCredito | null> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<AplicacionNotaCreditoRow>(
      `${SELECT_BASE} WHERE ID_APLICACION_NC = :id`,
      { id },
    );
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

/**
 * Aplica una NC de forma atómica y segura frente a concurrencia.
 * La nota no afecta saldo hasta este punto.
 */
export async function create(input: CreateAplicacionNotaCreditoInput): Promise<number> {
  const conn = await getConnection();
  try {
    const notaResult = await conn.execute<NotaLockRow>(
      `SELECT ID_NOTA_CREDITO, ID_CLIENTE, MONTO, ESTADO
         FROM CXC_NOTAS_CREDITO
        WHERE ID_NOTA_CREDITO = :idNotaCredito
        FOR UPDATE`,
      { idNotaCredito: input.idNotaCredito },
    );
    const nota = notaResult.rows?.[0];
    if (!nota) throw new BadRequestError('La nota de crédito seleccionada no existe');

    const documentoResult = await conn.execute<DocumentoLockRow>(
      `SELECT ID_DOCUMENTO, ID_CLIENTE, TOTAL, SALDO, ESTADO
         FROM CXC_DOCUMENTOS
        WHERE ID_DOCUMENTO = :idDocumento
        FOR UPDATE`,
      { idDocumento: input.idDocumento },
    );
    const documento = documentoResult.rows?.[0];
    if (!documento) throw new BadRequestError('El documento seleccionado no existe');

    const notaEstado = String(nota.ESTADO ?? '').trim().toUpperCase();
    if (notaEstado === 'ANULADA') throw new ConflictError('Una nota de crédito anulada no puede aplicarse.');
    if (notaEstado === 'APLICADA') throw new ConflictError('La nota de crédito ya está totalmente aplicada.');
    if (!['PENDIENTE', 'ACTIVA'].includes(notaEstado)) {
      throw new ConflictError(`La nota de crédito está en un estado no aplicable: ${notaEstado || 'SIN ESTADO'}.`);
    }

    const docEstado = String(documento.ESTADO ?? '').trim().toUpperCase();
    if (['PAGADO', 'PAGADA', 'ANULADO', 'ANULADA'].includes(docEstado) || Number(documento.SALDO) <= 0) {
      throw new ConflictError('El documento ya está pagado/anulado o no tiene saldo pendiente.');
    }

    if (nota.ID_CLIENTE !== documento.ID_CLIENTE) {
      throw new BadRequestError('La nota de crédito y el documento deben pertenecer al mismo cliente');
    }

    const sumResult = await conn.execute<{ TOTAL: number }>(
      `SELECT NVL(SUM(MONTO_APLICADO), 0) TOTAL
         FROM CXC_APLICACION_NOTA_CREDITO
        WHERE ID_NOTA_CREDITO = :idNotaCredito`,
      { idNotaCredito: input.idNotaCredito },
    );
    const yaAplicado = Number(sumResult.rows?.[0]?.TOTAL ?? 0);
    const disponibleNota = roundMoney(Number(nota.MONTO) - yaAplicado);
    const saldoDocumento = roundMoney(Number(documento.SALDO));
    const montoAplicado = roundMoney(Number(input.montoAplicado));

    if (montoAplicado <= 0) throw new BadRequestError('El monto aplicado debe ser mayor a cero');
    if (montoAplicado > saldoDocumento + 0.005) {
      throw new BadRequestError('El monto aplicado no puede superar el saldo del documento');
    }
    if (montoAplicado > disponibleNota + 0.005) {
      throw new BadRequestError('El monto aplicado no puede superar el monto disponible de la nota de crédito');
    }

    const insert = await conn.execute<{ id: number[] }>(
      `INSERT INTO CXC_APLICACION_NOTA_CREDITO
        (ID_NOTA_CREDITO, ID_DOCUMENTO, MONTO_APLICADO, FECHA_APLICACION)
       VALUES
        (:idNotaCredito, :idDocumento, :montoAplicado, TO_DATE(:fechaAplicacion, 'YYYY-MM-DD'))
       RETURNING ID_APLICACION_NC INTO :id`,
      {
        idNotaCredito: input.idNotaCredito,
        idDocumento: input.idDocumento,
        montoAplicado,
        fechaAplicacion: input.fechaAplicacion,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
    );

    const nuevoSaldo = Math.max(0, roundMoney(saldoDocumento - montoAplicado));
    const nuevoEstadoDocumento = deriveDocumentoEstado(Number(documento.TOTAL), nuevoSaldo, documento.ESTADO);
    await conn.execute(
      `UPDATE CXC_DOCUMENTOS
          SET SALDO = :saldo,
              ESTADO = :estado
        WHERE ID_DOCUMENTO = :idDocumento`,
      { saldo: nuevoSaldo, estado: nuevoEstadoDocumento, idDocumento: input.idDocumento },
    );

    const totalAplicado = roundMoney(yaAplicado + montoAplicado);
    const nuevoEstadoNota = totalAplicado >= Number(nota.MONTO) - 0.005 ? 'APLICADA' : 'PENDIENTE';
    await conn.execute(
      `UPDATE CXC_NOTAS_CREDITO SET ESTADO = :estado WHERE ID_NOTA_CREDITO = :idNotaCredito`,
      { estado: nuevoEstadoNota, idNotaCredito: input.idNotaCredito },
    );

    await conn.commit();
    return insert.outBinds!.id[0];
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

export async function update(id: number, input: UpdateAplicacionNotaCreditoInput): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, any> = { id };

  if (input.idNotaCredito !== undefined) { fields.push('ID_NOTA_CREDITO = :idNotaCredito'); binds.idNotaCredito = input.idNotaCredito; }
  if (input.idDocumento !== undefined) { fields.push('ID_DOCUMENTO = :idDocumento'); binds.idDocumento = input.idDocumento; }
  if (input.montoAplicado !== undefined) { fields.push('MONTO_APLICADO = :montoAplicado'); binds.montoAplicado = input.montoAplicado; }
  if (input.fechaAplicacion !== undefined) { fields.push(`FECHA_APLICACION = TO_DATE(:fechaAplicacion, 'YYYY-MM-DD')`); binds.fechaAplicacion = input.fechaAplicacion; }
  if (!fields.length) return;

  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE CXC_APLICACION_NOTA_CREDITO SET ${fields.join(', ')} WHERE ID_APLICACION_NC = :id`,
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

export async function remove(id: number): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(`DELETE FROM CXC_APLICACION_NOTA_CREDITO WHERE ID_APLICACION_NC = :id`, { id });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

export async function sumAplicadoPorNota(idNotaCredito: number, excludeId?: number): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ TOTAL: number }>(
      `SELECT NVL(SUM(MONTO_APLICADO), 0) AS TOTAL
         FROM CXC_APLICACION_NOTA_CREDITO
        WHERE ID_NOTA_CREDITO = :idNotaCredito
          AND (:excludeId IS NULL OR ID_APLICACION_NC <> :excludeId)`,
      { idNotaCredito, excludeId: excludeId ?? null },
    );
    return Number(result.rows?.[0]?.TOTAL ?? 0);
  } finally {
    await conn.close();
  }
}
