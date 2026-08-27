import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type { ConvenioPago, CreateConvenioPagoInput, UpdateConvenioPagoInput } from '@erp/contracts';

interface ConvenioPagoRow {
  ID_CONVENIO: number;
  ID_CLIENTE: number;
  NOMBRE_CLIENTE: string | null;
  FECHA_CONVENIO: Date;
  MONTO_DEUDA: number;
  NUMERO_CUOTAS: number;
  ESTADO: string;
  OBSERVACIONES: string | null;
}

function mapRow(row: ConvenioPagoRow): ConvenioPago {
  return {
    idConvenio: row.ID_CONVENIO,
    idCliente: row.ID_CLIENTE,
    nombreCliente: row.NOMBRE_CLIENTE,
    fechaConvenio: row.FECHA_CONVENIO?.toISOString() ?? '',
    montoDeuda: row.MONTO_DEUDA,
    numeroCuotas: row.NUMERO_CUOTAS,
    estado: row.ESTADO as ConvenioPago['estado'],
    observaciones: row.OBSERVACIONES,
  };
}

const SELECT_BASE = `
  SELECT cv.ID_CONVENIO, cv.ID_CLIENTE, c.NOMBRE AS NOMBRE_CLIENTE, cv.FECHA_CONVENIO,
         cv.MONTO_DEUDA, cv.NUMERO_CUOTAS, cv.ESTADO, cv.OBSERVACIONES
  FROM CXC_CONVENIOS_PAGO cv
  JOIN CXC_CLIENTES c ON c.ID_CLIENTE = cv.ID_CLIENTE
`;

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{ data: ConvenioPago[]; total: number }> {
  const conn = await getConnection();
  try {
    const offset = (params.page - 1) * params.limit;
    const whereClause = params.search
      ? `WHERE UPPER(c.NOMBRE) LIKE UPPER(:search) OR UPPER(cv.ESTADO) LIKE UPPER(:search)`
      : '';
    const searchBind = params.search ? { search: `%${params.search}%` } : {};

    const dataResult = await conn.execute<ConvenioPagoRow>(
      `${SELECT_BASE} ${whereClause}
       ORDER BY cv.FECHA_CONVENIO DESC, cv.ID_CONVENIO DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...searchBind, offset, limit: params.limit },
    );

    const countResult = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL FROM CXC_CONVENIOS_PAGO cv JOIN CXC_CLIENTES c ON c.ID_CLIENTE = cv.ID_CLIENTE ${whereClause}`,
      searchBind,
    );

    const total = countResult.rows?.[0]?.TOTAL ?? 0;
    return { data: (dataResult.rows ?? []).map(mapRow), total };
  } finally {
    await conn.close();
  }
}

export async function findById(id: number): Promise<ConvenioPago | null> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<ConvenioPagoRow>(`${SELECT_BASE} WHERE cv.ID_CONVENIO = :id`, { id });
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

export async function create(input: CreateConvenioPagoInput): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ id: number[] }>(
      `INSERT INTO CXC_CONVENIOS_PAGO
         (ID_CLIENTE, FECHA_CONVENIO, MONTO_DEUDA, NUMERO_CUOTAS, ESTADO, OBSERVACIONES)
       VALUES
         (:idCliente, TO_DATE(:fechaConvenio, 'YYYY-MM-DD'), :montoDeuda, :numeroCuotas, :estado, :observaciones)
       RETURNING ID_CONVENIO INTO :id`,
      {
        idCliente: input.idCliente,
        fechaConvenio: input.fechaConvenio,
        montoDeuda: input.montoDeuda,
        numeroCuotas: input.numeroCuotas,
        estado: input.estado ?? 'ACTIVO',
        observaciones: input.observaciones ?? null,
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

export async function update(id: number, input: UpdateConvenioPagoInput): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, any> = { id };

  if (input.estado !== undefined) { fields.push('ESTADO = :estado'); binds.estado = input.estado; }
  if (input.observaciones !== undefined) { fields.push('OBSERVACIONES = :observaciones'); binds.observaciones = input.observaciones; }
  // Nota deliberada: montoDeuda, numeroCuotas y fechaConvenio NO se dejan
  // editar aquí porque ya generaron las cuotas al crearse el convenio
  // (ver convenioPago.service.ts). Cambiarlos después desincroniza las
  // cuotas ya generadas. Si el negocio necesita eso, debe ser un flujo
  // explícito de "renegociar convenio", no un PATCH simple.

  if (fields.length === 0) return;

  const conn = await getConnection();
  try {
    await conn.execute(`UPDATE CXC_CONVENIOS_PAGO SET ${fields.join(', ')} WHERE ID_CONVENIO = :id`, binds);
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
    // Las cuotas hijas se eliminan primero por integridad referencial
    // (no hay ON DELETE CASCADE en el DDL original).
    await conn.execute(`DELETE FROM CXC_CONVENIO_CUOTAS WHERE ID_CONVENIO = :id`, { id });
    await conn.execute(`DELETE FROM CXC_CONVENIOS_PAGO WHERE ID_CONVENIO = :id`, { id });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}
