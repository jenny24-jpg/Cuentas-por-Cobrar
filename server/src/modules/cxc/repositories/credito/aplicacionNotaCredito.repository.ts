import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type {
  AplicacionNotaCredito,
  CreateAplicacionNotaCreditoInput,
  UpdateAplicacionNotaCreditoInput,
} from '@erp/contracts';

interface AplicacionNotaCreditoRow {
  ID_APLICACION_NC: number;
  ID_NOTA_CREDITO: number;
  ID_DOCUMENTO: number;
  MONTO_APLICADO: number;
  FECHA_APLICACION: Date;
}

function mapRow(
  row: AplicacionNotaCreditoRow,
): AplicacionNotaCredito {
  return {
    idAplicacionNc: row.ID_APLICACION_NC,
    idNotaCredito: row.ID_NOTA_CREDITO,
    idDocumento: row.ID_DOCUMENTO,
    montoAplicado: row.MONTO_APLICADO,
    fechaAplicacion: row.FECHA_APLICACION.toISOString(),
  };
}

const SELECT_BASE = `
  SELECT
    ID_APLICACION_NC,
    ID_NOTA_CREDITO,
    ID_DOCUMENTO,
    MONTO_APLICADO,
    FECHA_APLICACION
  FROM CXC_APLICACION_NOTA_CREDITO
`;

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{
  data: AplicacionNotaCredito[];
  total: number;
}> {
  const conn = await getConnection();

  try {
    const offset = (params.page - 1) * params.limit;

    const whereClause = params.search
      ? `
        WHERE TO_CHAR(ID_APLICACION_NC) LIKE :search
           OR TO_CHAR(ID_NOTA_CREDITO) LIKE :search
           OR TO_CHAR(ID_DOCUMENTO) LIKE :search
           OR TO_CHAR(MONTO_APLICADO) LIKE :search
      `
      : '';

    const searchBind = params.search
      ? { search: `%${params.search}%` }
      : {};

    const dataResult =
      await conn.execute<AplicacionNotaCreditoRow>(
        `${SELECT_BASE}
         ${whereClause}
         ORDER BY ID_APLICACION_NC DESC
         OFFSET :offset ROWS
         FETCH NEXT :limit ROWS ONLY`,
        {
          ...searchBind,
          offset,
          limit: params.limit,
        },
      );

    const countResult = await conn.execute<{
      TOTAL: number;
    }>(
      `SELECT COUNT(*) AS TOTAL
       FROM CXC_APLICACION_NOTA_CREDITO
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
): Promise<AplicacionNotaCredito | null> {
  const conn = await getConnection();

  try {
    const result =
      await conn.execute<AplicacionNotaCreditoRow>(
        `${SELECT_BASE}
         WHERE ID_APLICACION_NC = :id`,
        { id },
      );

    const row = result.rows?.[0];

    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

export async function create(
  input: CreateAplicacionNotaCreditoInput,
): Promise<number> {
  const conn = await getConnection();

  try {
    const result = await conn.execute<{
      id: number[];
    }>(
      `INSERT INTO CXC_APLICACION_NOTA_CREDITO
        (
          ID_NOTA_CREDITO,
          ID_DOCUMENTO,
          MONTO_APLICADO,
          FECHA_APLICACION
        )
       VALUES
        (
          :idNotaCredito,
          :idDocumento,
          :montoAplicado,
          TO_DATE(:fechaAplicacion, 'YYYY-MM-DD')
        )
       RETURNING ID_APLICACION_NC INTO :id`,
      {
        idNotaCredito: input.idNotaCredito,
        idDocumento: input.idDocumento,
        montoAplicado: input.montoAplicado,
        fechaAplicacion: input.fechaAplicacion,
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
  input: UpdateAplicacionNotaCreditoInput,
): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, any> = { id };

  if (input.idNotaCredito !== undefined) {
    fields.push('ID_NOTA_CREDITO = :idNotaCredito');
    binds.idNotaCredito = input.idNotaCredito;
  }

  if (input.idDocumento !== undefined) {
    fields.push('ID_DOCUMENTO = :idDocumento');
    binds.idDocumento = input.idDocumento;
  }

  if (input.montoAplicado !== undefined) {
    fields.push('MONTO_APLICADO = :montoAplicado');
    binds.montoAplicado = input.montoAplicado;
  }

  if (input.fechaAplicacion !== undefined) {
    fields.push(
      `FECHA_APLICACION = TO_DATE(:fechaAplicacion, 'YYYY-MM-DD')`,
    );
    binds.fechaAplicacion = input.fechaAplicacion;
  }

  if (fields.length === 0) return;

  const conn = await getConnection();

  try {
    await conn.execute(
      `UPDATE CXC_APLICACION_NOTA_CREDITO
       SET ${fields.join(', ')}
       WHERE ID_APLICACION_NC = :id`,
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

export async function remove(
  id: number,
): Promise<void> {
  const conn = await getConnection();

  try {
    await conn.execute(
      `DELETE FROM CXC_APLICACION_NOTA_CREDITO
       WHERE ID_APLICACION_NC = :id`,
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