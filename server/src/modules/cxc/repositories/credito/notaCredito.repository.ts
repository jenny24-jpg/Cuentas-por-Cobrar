import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type {
  NotaCredito,
  CreateNotaCreditoInput,
  UpdateNotaCreditoInput,
} from '@erp/contracts';

interface NotaCreditoRow {
  ID_NOTA_CREDITO: number;
  ID_CLIENTE: number;
  ID_DOCUMENTO_REFERENCIA: number | null;
  DESCRIPCION: string | null;
  SERIE: string | null;
  NUMERO: string | null;
  FECHA: Date;
  MONTO: number;
  ESTADO: 'ACTIVA' | 'ANULADA';
}

function mapRow(row: NotaCreditoRow): NotaCredito {
  return {
    idNotaCredito: row.ID_NOTA_CREDITO,
    idCliente: row.ID_CLIENTE,
    idDocumentoReferencia: row.ID_DOCUMENTO_REFERENCIA,
    descripcion: row.DESCRIPCION,
    serie: row.SERIE,
    numero: row.NUMERO,
    fecha: row.FECHA.toISOString(),
    monto: row.MONTO,
    estado: row.ESTADO,
  };
}

const SELECT_BASE = `
  SELECT
    ID_NOTA_CREDITO,
    ID_CLIENTE,
    ID_DOCUMENTO_REFERENCIA,
    DESCRIPCION,
    SERIE,
    NUMERO,
    FECHA,
    MONTO,
    ESTADO
  FROM CXC_NOTAS_CREDITO
`;

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{ data: NotaCredito[]; total: number }> {
  const conn = await getConnection();

  try {
    const offset = (params.page - 1) * params.limit;

    const whereClause = params.search
      ? `
        WHERE TO_CHAR(ID_CLIENTE) LIKE :search
           OR TO_CHAR(ID_NOTA_CREDITO) LIKE :search
           OR UPPER(NVL(DESCRIPCION, '')) LIKE UPPER(:search)
           OR UPPER(NVL(SERIE, '')) LIKE UPPER(:search)
           OR UPPER(NVL(NUMERO, '')) LIKE UPPER(:search)
           OR UPPER(ESTADO) LIKE UPPER(:search)
      `
      : '';

    const searchBind = params.search
      ? { search: `%${params.search}%` }
      : {};

    const dataResult = await conn.execute<NotaCreditoRow>(
      `${SELECT_BASE}
       ${whereClause}
       ORDER BY ID_NOTA_CREDITO DESC
       OFFSET :offset ROWS
       FETCH NEXT :limit ROWS ONLY`,
      {
        ...searchBind,
        offset,
        limit: params.limit,
      },
    );

    const countResult = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL
       FROM CXC_NOTAS_CREDITO
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

export async function findById(
  id: number,
): Promise<NotaCredito | null> {
  const conn = await getConnection();

  try {
    const result = await conn.execute<NotaCreditoRow>(
      `${SELECT_BASE}
       WHERE ID_NOTA_CREDITO = :id`,
      { id },
    );

    const row = result.rows?.[0];

    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

export async function create(
  input: CreateNotaCreditoInput,
): Promise<number> {
  const conn = await getConnection();

  try {
    const result = await conn.execute<{ id: number[] }>(
      `INSERT INTO CXC_NOTAS_CREDITO
        (
          ID_CLIENTE,
          ID_DOCUMENTO_REFERENCIA,
          DESCRIPCION,
          SERIE,
          NUMERO,
          FECHA,
          MONTO,
          ESTADO
        )
       VALUES
        (
          :idCliente,
          :idDocumentoReferencia,
          :descripcion,
          :serie,
          :numero,
          TO_DATE(:fecha, 'YYYY-MM-DD'),
          :monto,
          :estado
        )
       RETURNING ID_NOTA_CREDITO INTO :id`,
      {
        idCliente: input.idCliente,
        idDocumentoReferencia: input.idDocumentoReferencia ?? null,
        descripcion: input.descripcion ?? null,
        serie: input.serie ?? null,
        numero: input.numero ?? null,
        fecha: input.fecha,
        monto: input.monto,
        estado: input.estado ?? 'ACTIVA',
        id: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER,
        },
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

export async function update(
  id: number,
  input: UpdateNotaCreditoInput,
): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, any> = { id };

  if (input.idCliente !== undefined) {
    fields.push('ID_CLIENTE = :idCliente');
    binds.idCliente = input.idCliente;
  }

  if (input.idDocumentoReferencia !== undefined) {
    fields.push('ID_DOCUMENTO_REFERENCIA = :idDocumentoReferencia');
    binds.idDocumentoReferencia = input.idDocumentoReferencia ?? null;
  }

  if (input.descripcion !== undefined) {
    fields.push('DESCRIPCION = :descripcion');
    binds.descripcion = input.descripcion ?? null;
  }

  if (input.serie !== undefined) {
    fields.push('SERIE = :serie');
    binds.serie = input.serie ?? null;
  }

  if (input.numero !== undefined) {
    fields.push('NUMERO = :numero');
    binds.numero = input.numero ?? null;
  }

  if (input.fecha !== undefined) {
    fields.push(`FECHA = TO_DATE(:fecha, 'YYYY-MM-DD')`);
    binds.fecha = input.fecha;
  }

  if (input.monto !== undefined) {
    fields.push('MONTO = :monto');
    binds.monto = input.monto;
  }

  if (input.estado !== undefined) {
    fields.push('ESTADO = :estado');
    binds.estado = input.estado;
  }

  if (fields.length === 0) return;

  const conn = await getConnection();

  try {
    await conn.execute(
      `UPDATE CXC_NOTAS_CREDITO
       SET ${fields.join(', ')}
       WHERE ID_NOTA_CREDITO = :id`,
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
    await conn.execute(
      `DELETE FROM CXC_NOTAS_CREDITO
       WHERE ID_NOTA_CREDITO = :id`,
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