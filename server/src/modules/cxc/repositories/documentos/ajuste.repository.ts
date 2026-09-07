import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type { Ajuste, CreateAjusteInput, UpdateAjusteInput } from '@erp/contracts';

interface AjusteRow {
  ID_AJUSTE: number;
  ID_CLIENTE: number;
  NOMBRE_CLIENTE: string | null;
  ID_DOCUMENTO: number | null;
  TIPO_AJUSTE: string;
  MONTO: number;
  MOTIVO: string | null;
  FECHA: Date;
  ID_EMPLEADO: number;
  NOMBRE_EMPLEADO: string | null;
}

function mapRow(row: AjusteRow): Ajuste {
  return {
    idAjuste: row.ID_AJUSTE,
    idCliente: row.ID_CLIENTE,
    nombreCliente: row.NOMBRE_CLIENTE,
    idDocumento: row.ID_DOCUMENTO,
    tipoAjuste: row.TIPO_AJUSTE,
    monto: row.MONTO,
    motivo: row.MOTIVO,
    fecha: row.FECHA?.toISOString() ?? '',
    idEmpleado: row.ID_EMPLEADO,
    nombreEmpleado: row.NOMBRE_EMPLEADO,
  };
}

const SELECT_BASE = `
  SELECT a.ID_AJUSTE,
         a.ID_CLIENTE,
         c.NOMBRE AS NOMBRE_CLIENTE,
         a.ID_DOCUMENTO,
         a.TIPO_AJUSTE,
         a.MONTO,
         a.MOTIVO,
         a.FECHA,
         a.ID_EMPLEADO,
         (e.NOMBRE || ' ' || e.APELLIDO) AS NOMBRE_EMPLEADO
    FROM CXC_AJUSTES a
    LEFT JOIN CLIENTE c ON c.ID_CLIENTE = a.ID_CLIENTE
    LEFT JOIN EMPLEADO e ON e.ID_EMPLEADO = a.ID_EMPLEADO
`;

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{ data: Ajuste[]; total: number }> {
  const conn = await getConnection();
  try {
    const offset = (params.page - 1) * params.limit;
    const whereClause = params.search
      ? `WHERE UPPER(c.NOMBRE) LIKE UPPER(:search)
          OR UPPER(a.TIPO_AJUSTE) LIKE UPPER(:search)
          OR UPPER(a.MOTIVO) LIKE UPPER(:search)
          OR TO_CHAR(a.ID_DOCUMENTO) LIKE :search`
      : '';
    const searchBind = params.search ? { search: `%${params.search}%` } : {};

    const dataResult = await conn.execute<AjusteRow>(
      `${SELECT_BASE}
       ${whereClause}
       ORDER BY a.FECHA DESC, a.ID_AJUSTE DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...searchBind, offset, limit: params.limit },
    );

    const countResult = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL
         FROM CXC_AJUSTES a
         LEFT JOIN CLIENTE c ON c.ID_CLIENTE = a.ID_CLIENTE
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

export async function findById(id: number): Promise<Ajuste | null> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<AjusteRow>(
      `${SELECT_BASE} WHERE a.ID_AJUSTE = :id`,
      { id },
    );
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

export async function create(input: CreateAjusteInput): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ id: number[] }>(
      `INSERT INTO CXC_AJUSTES
         (ID_CLIENTE, ID_DOCUMENTO, TIPO_AJUSTE, MONTO, MOTIVO, FECHA, ID_EMPLEADO)
       VALUES
         (:idCliente, :idDocumento, :tipoAjuste, :monto, :motivo,
          NVL(TO_DATE(:fecha, 'YYYY-MM-DD'), SYSDATE), :idEmpleado)
       RETURNING ID_AJUSTE INTO :id`,
      {
        idCliente: input.idCliente,
        idDocumento: input.idDocumento ?? null,
        tipoAjuste: input.tipoAjuste,
        monto: input.monto,
        motivo: input.motivo ?? null,
        fecha: input.fecha ?? null,
        idEmpleado: input.idEmpleado,
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

export async function update(id: number, input: UpdateAjusteInput): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, unknown> = { id };

  if (input.idCliente !== undefined) { fields.push('ID_CLIENTE = :idCliente'); binds.idCliente = input.idCliente; }
  if (input.idDocumento !== undefined) { fields.push('ID_DOCUMENTO = :idDocumento'); binds.idDocumento = input.idDocumento; }
  if (input.tipoAjuste !== undefined) { fields.push('TIPO_AJUSTE = :tipoAjuste'); binds.tipoAjuste = input.tipoAjuste; }
  if (input.monto !== undefined) { fields.push('MONTO = :monto'); binds.monto = input.monto; }
  if (input.motivo !== undefined) { fields.push('MOTIVO = :motivo'); binds.motivo = input.motivo; }
  if (input.fecha !== undefined) {
    fields.push(`FECHA = TO_DATE(:fecha, 'YYYY-MM-DD')`);
    binds.fecha = input.fecha;
  }
  if (input.idEmpleado !== undefined) { fields.push('ID_EMPLEADO = :idEmpleado'); binds.idEmpleado = input.idEmpleado; }

  if (fields.length === 0) return;

  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE CXC_AJUSTES SET ${fields.join(', ')} WHERE ID_AJUSTE = :id`,
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
    await conn.execute(`DELETE FROM CXC_AJUSTES WHERE ID_AJUSTE = :id`, { id });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}
