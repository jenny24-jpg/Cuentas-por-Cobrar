import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type {
  Documento,
  CreateDocumentoInput,
  UpdateDocumentoInput,
} from '@erp/contracts';

interface DocumentoRow {
  ID_DOCUMENTO: number;
  ID_CLIENTE: number;
  NOMBRE_CLIENTE: string | null;
  NIT_CLIENTE: string | null;
  ID_TIPO_DOCUMENTO: number;
  NOMBRE_TIPO_DOCUMENTO: string | null;
  ID_MONEDA: number;
  ESTADO: string;
  SERIE: string | null;
  NUMERO_DOCUMENTO: string;
  FECHA_DOCUMENTO: Date;
  FECHA_VENCIMIENTO: Date;
  TOTAL: number;
  SALDO: number;
}

function mapRow(row: DocumentoRow): Documento {
  return {
    idDocumento: row.ID_DOCUMENTO,
    idCliente: row.ID_CLIENTE,
    nombreCliente: row.NOMBRE_CLIENTE,
    nitCliente: row.NIT_CLIENTE,
    idTipoDocumento: row.ID_TIPO_DOCUMENTO,
    nombreTipoDocumento: row.NOMBRE_TIPO_DOCUMENTO,
    idMoneda: row.ID_MONEDA,
    estado: row.ESTADO?.trim(),
    serie: row.SERIE,
    numeroDocumento: row.NUMERO_DOCUMENTO,
    fechaDocumento: row.FECHA_DOCUMENTO?.toISOString() ?? '',
    fechaVencimiento: row.FECHA_VENCIMIENTO?.toISOString() ?? '',
    total: row.TOTAL,
    saldo: row.SALDO,
  };
}

const SELECT_BASE = `
  SELECT d.ID_DOCUMENTO,
         d.ID_CLIENTE,
         c.NOMBRE AS NOMBRE_CLIENTE,
         d.NIT_CLIENTE,
         d.ID_TIPO_DOCUMENTO,
         td.NOMBRE AS NOMBRE_TIPO_DOCUMENTO,
         d.ID_MONEDA,
         d.ESTADO,
         d.SERIE,
         d.NUMERO_DOCUMENTO,
         d.FECHA_DOCUMENTO,
         d.FECHA_VENCIMIENTO,
         d.TOTAL,
         d.SALDO
    FROM CXC_DOCUMENTOS d
    LEFT JOIN CLIENTE c ON c.ID_CLIENTE = d.ID_CLIENTE
    LEFT JOIN CXC_TIPOS_DOCUMENTO td ON td.ID_TIPO_DOCUMENTO = d.ID_TIPO_DOCUMENTO
`;

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{ data: Documento[]; total: number }> {
  const conn = await getConnection();
  try {
    const offset = (params.page - 1) * params.limit;
    const whereClause = params.search
      ? `WHERE UPPER(c.NOMBRE) LIKE UPPER(:search)
          OR UPPER(d.NIT_CLIENTE) LIKE UPPER(:search)
          OR UPPER(d.SERIE) LIKE UPPER(:search)
          OR UPPER(d.NUMERO_DOCUMENTO) LIKE UPPER(:search)
          OR UPPER(d.ESTADO) LIKE UPPER(:search)`
      : '';
    const searchBind = params.search ? { search: `%${params.search}%` } : {};

    const dataResult = await conn.execute<DocumentoRow>(
      `${SELECT_BASE}
       ${whereClause}
       ORDER BY d.FECHA_DOCUMENTO DESC, d.ID_DOCUMENTO DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...searchBind, offset, limit: params.limit },
    );

    const countResult = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL
         FROM CXC_DOCUMENTOS d
         LEFT JOIN CLIENTE c ON c.ID_CLIENTE = d.ID_CLIENTE
        ${whereClause}`,
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

export async function findById(id: number): Promise<Documento | null> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<DocumentoRow>(
      `${SELECT_BASE} WHERE d.ID_DOCUMENTO = :id`,
      { id },
    );
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

export async function create(input: CreateDocumentoInput): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ id: number[] }>(
      `INSERT INTO CXC_DOCUMENTOS
         (ID_CLIENTE, NIT_CLIENTE, ID_TIPO_DOCUMENTO, ID_MONEDA, ESTADO,
          SERIE, NUMERO_DOCUMENTO, FECHA_DOCUMENTO, FECHA_VENCIMIENTO, TOTAL, SALDO)
       VALUES
         (:idCliente, :nitCliente, :idTipoDocumento, :idMoneda, :estado,
          :serie, :numeroDocumento,
          TO_DATE(:fechaDocumento, 'YYYY-MM-DD'),
          TO_DATE(:fechaVencimiento, 'YYYY-MM-DD'),
          :total, NVL(:saldo, :total))
       RETURNING ID_DOCUMENTO INTO :id`,
      {
        idCliente: input.idCliente,
        nitCliente: input.nitCliente ?? null,
        idTipoDocumento: input.idTipoDocumento,
        idMoneda: input.idMoneda,
        estado: input.estado ?? 'PENDIENTE',
        serie: input.serie ?? null,
        numeroDocumento: input.numeroDocumento,
        fechaDocumento: input.fechaDocumento,
        fechaVencimiento: input.fechaVencimiento,
        total: input.total,
        saldo: input.saldo ?? null,
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

export async function update(id: number, input: UpdateDocumentoInput): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, any> = { id };

  if (input.idCliente !== undefined) { fields.push('ID_CLIENTE = :idCliente'); binds.idCliente = input.idCliente; }
  if (input.nitCliente !== undefined) { fields.push('NIT_CLIENTE = :nitCliente'); binds.nitCliente = input.nitCliente; }
  if (input.idTipoDocumento !== undefined) { fields.push('ID_TIPO_DOCUMENTO = :idTipoDocumento'); binds.idTipoDocumento = input.idTipoDocumento; }
  if (input.idMoneda !== undefined) { fields.push('ID_MONEDA = :idMoneda'); binds.idMoneda = input.idMoneda; }
  if (input.estado !== undefined) { fields.push('ESTADO = :estado'); binds.estado = input.estado; }
  if (input.serie !== undefined) { fields.push('SERIE = :serie'); binds.serie = input.serie; }
  if (input.numeroDocumento !== undefined) { fields.push('NUMERO_DOCUMENTO = :numeroDocumento'); binds.numeroDocumento = input.numeroDocumento; }
  if (input.fechaDocumento !== undefined) {
    fields.push(`FECHA_DOCUMENTO = TO_DATE(:fechaDocumento, 'YYYY-MM-DD')`);
    binds.fechaDocumento = input.fechaDocumento;
  }
  if (input.fechaVencimiento !== undefined) {
    fields.push(`FECHA_VENCIMIENTO = TO_DATE(:fechaVencimiento, 'YYYY-MM-DD')`);
    binds.fechaVencimiento = input.fechaVencimiento;
  }
  if (input.total !== undefined) { fields.push('TOTAL = :total'); binds.total = input.total; }
  if (input.saldo !== undefined) { fields.push('SALDO = :saldo'); binds.saldo = input.saldo; }

  if (fields.length === 0) return;

  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE CXC_DOCUMENTOS SET ${fields.join(', ')} WHERE ID_DOCUMENTO = :id`,
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
    await conn.execute(`DELETE FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO = :id`, { id });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}
