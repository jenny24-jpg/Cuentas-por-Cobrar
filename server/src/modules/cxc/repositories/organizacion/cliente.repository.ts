import oracledb, { type Connection } from 'oracledb';
import { getConnection } from '../../../../config/database';
import type { Cliente, ClienteResumen, CreateClienteInput, UpdateClienteInput } from '@erp/contracts';
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/errors/AppError';
import { roundMoney } from '../../shared/financialRules';

interface Row {
  ID_CLIENTE: number;
  NOMBRE: string;
  NIT: string | null;
  DIRECCION: string | null;
  CODIGO_COBRO: string;
  ID_CONDICION: number | null;
  DIAS_CREDITO: number | null;
  DIAS_GRACIA: number | null;
  PORCENTAJE_MORA: number | null;
  ESTADO: string | null;
}

const mapRow = (r: Row): Cliente => ({
  idCliente: r.ID_CLIENTE,
  nombre: r.NOMBRE,
  nit: r.NIT,
  direccion: r.DIRECCION,
  codigoCobro: r.CODIGO_COBRO,
  idCondicion: r.ID_CONDICION,
  diasCredito: r.DIAS_CREDITO,
  diasGracia: r.DIAS_GRACIA,
  porcentajeMora: r.PORCENTAJE_MORA,
  estado: r.ESTADO ? r.ESTADO.trim() : null,
});

const SELECT_BASE = `
  SELECT c.ID_CLIENTE, c.NOMBRE, c.NIT, c.DIRECCION,
         'CR-' || LPAD(c.ID_CLIENTE, 5, '0') AS CODIGO_COBRO, c.ID_CONDICION,
         cc.DIAS_CREDITO, cc.DIAS_GRACIA, cc.PORCENTAJE_MORA,
         c.ESTADO
    FROM CLIENTE c
    LEFT JOIN CXC_CONDICIONES_CREDITO cc ON cc.ID_CONDICION = c.ID_CONDICION
`;

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
  estado?: string;
}): Promise<{ data: Cliente[]; total: number }> {
  const conn = await getConnection();
  try {
    const conditions: string[] = [];
    const binds: Record<string, string> = {};
    if (params.search) {
      conditions.push(`(UPPER(c.NOMBRE) LIKE UPPER(:search) OR UPPER(NVL(c.NIT, '')) LIKE UPPER(:search)
        OR UPPER(NVL(c.DIRECCION, '')) LIKE UPPER(:search) OR TO_CHAR(c.ID_CLIENTE) = :searchExacto
        OR 'CR-' || LPAD(c.ID_CLIENTE, 5, '0') = UPPER(:searchExacto))`);
      binds.search = `%${params.search}%`;
      binds.searchExacto = params.search.trim();
    }
    if (params.estado) {
      conditions.push(`TRIM(c.ESTADO) = :estado`);
      binds.estado = params.estado;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const offset = (params.page - 1) * params.limit;
    const data = await conn.execute<Row>(
      `${SELECT_BASE} ${where}
        ORDER BY c.ID_CLIENTE
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { ...binds, offset, limit: params.limit },
    );
    const count = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL FROM CLIENTE c ${where}`,
      binds,
    );
    return { data: (data.rows ?? []).map(mapRow), total: count.rows?.[0]?.TOTAL ?? 0 };
  } finally {
    await conn.close();
  }
}

export async function findById(id: number): Promise<Cliente | null> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<Row>(`${SELECT_BASE} WHERE c.ID_CLIENTE = :id`, { id });
    return result.rows?.[0] ? mapRow(result.rows[0]) : null;
  } finally {
    await conn.close();
  }
}

/** Cartera abierta del cliente y fecha de su último pago no anulado. */
export async function findResumen(id: number): Promise<ClienteResumen> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{
      SALDO_PENDIENTE: number; SALDO_VENCIDO: number; DOCS_ABIERTOS: number; DOCS_VENCIDOS: number; ULTIMO_PAGO: Date | null;
    }>(
      `SELECT a.SALDO_PENDIENTE, a.SALDO_VENCIDO, a.DOCS_ABIERTOS, a.DOCS_VENCIDOS,
              (SELECT MAX(p.FECHA_PAGO) FROM CXC_PAGOS p
                WHERE p.ID_CLIENTE = :id AND UPPER(p.ESTADO) NOT IN ('ANULADO', 'REVERSADO')) AS ULTIMO_PAGO
         FROM (SELECT NVL(SUM(d.SALDO), 0) AS SALDO_PENDIENTE,
                      NVL(SUM(CASE WHEN d.FECHA_VENCIMIENTO < TRUNC(SYSDATE) THEN d.SALDO ELSE 0 END), 0) AS SALDO_VENCIDO,
                      COUNT(d.ID_DOCUMENTO) AS DOCS_ABIERTOS,
                      COUNT(CASE WHEN d.FECHA_VENCIMIENTO < TRUNC(SYSDATE) THEN 1 END) AS DOCS_VENCIDOS
                 FROM CXC_DOCUMENTOS d
                WHERE d.ID_CLIENTE = :id
                  AND d.SALDO > 0.005
                  AND UPPER(d.ESTADO) NOT IN ('ANULADO', 'ANULADA', 'PAGADO', 'PAGADA')) a`,
      { id },
    );
    const r = result.rows?.[0];
    return {
      saldoPendiente: roundMoney(Number(r?.SALDO_PENDIENTE ?? 0)),
      saldoVencido: roundMoney(Number(r?.SALDO_VENCIDO ?? 0)),
      documentosAbiertos: Number(r?.DOCS_ABIERTOS ?? 0),
      documentosVencidos: Number(r?.DOCS_VENCIDOS ?? 0),
      ultimoPago: r?.ULTIMO_PAGO ? r.ULTIMO_PAGO.toISOString().slice(0, 10) : null,
    };
  } finally {
    await conn.close();
  }
}

/** La condición debe existir y estar activa (salvo que sea la que el cliente ya tenía). */
async function validarCondicion(conn: Connection, idCondicion: number, condicionActual: number | null) {
  const condicion = await conn.execute<{ ESTADO: string }>(
    `SELECT ESTADO FROM CXC_CONDICIONES_CREDITO WHERE ID_CONDICION = :idCondicion`, { idCondicion });
  if (!condicion.rows?.length) throw new BadRequestError('La condición de pago seleccionada no existe.');
  if (condicionActual !== idCondicion && String(condicion.rows[0].ESTADO).trim() !== 'A') {
    throw new BadRequestError('La condición de pago seleccionada está inactiva.');
  }
}

/**
 * La base tiene UNIQUE sobre NIT (UQ_CXC_CLIENTES_NIT), incluido CF. Se compara sin guiones
 * ni espacios para detectar también "1234567-9" frente a "12345679".
 */
async function validarNitUnico(conn: Connection, nit: string, excluirId: number | null) {
  const duplicado = await conn.execute<{ NOMBRE: string }>(
    `SELECT NOMBRE FROM CLIENTE
      WHERE (:excluirId IS NULL OR ID_CLIENTE <> :excluirId)
        AND UPPER(REPLACE(REPLACE(NIT, '-', ''), ' ', '')) = UPPER(REPLACE(REPLACE(:nit, '-', ''), ' ', ''))
      FETCH FIRST 1 ROWS ONLY`,
    { excluirId, nit });
  if (duplicado.rows?.length) throw new ConflictError(`El NIT ya está registrado para el cliente "${duplicado.rows[0].NOMBRE}".`);
}

/** ORA-00001: otro usuario registró el mismo NIT entre la validación y el guardado. */
const esNitDuplicado = (err: unknown) => (err as { errorNum?: number })?.errorNum === 1;

/** Crea el cliente; el ID lo asigna la columna identity. */
export async function create(input: CreateClienteInput): Promise<number> {
  const conn = await getConnection();
  try {
    await validarCondicion(conn, input.idCondicion, null);
    await validarNitUnico(conn, input.nit, null);
    const result = await conn.execute<{ id: number[] }>(
      `INSERT INTO CLIENTE (NOMBRE, NIT, DIRECCION, ID_CONDICION, ESTADO)
       VALUES (:nombre, :nit, :direccion, :idCondicion, :estado)
       RETURNING ID_CLIENTE INTO :id`,
      {
        nombre: input.nombre, nit: input.nit, direccion: input.direccion, idCondicion: input.idCondicion, estado: input.estado,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
    );
    await conn.commit();
    return result.outBinds!.id[0];
  } catch (err) {
    await conn.rollback();
    if (esNitDuplicado(err)) throw new ConflictError('El NIT ya está registrado para otro cliente.');
    throw err;
  } finally {
    await conn.close();
  }
}

/**
 * Actualiza nombre, NIT, condición de pago y estado en una sola transacción.
 * Bloquea el cliente, exige una condición existente (activa, salvo que sea la que ya
 * tenía) y rechaza un NIT que ya use otro cliente (la base no admite NIT repetidos, ni CF).
 */
export async function update(id: number, input: UpdateClienteInput & { nit: string }): Promise<void> {
  const conn = await getConnection();
  try {
    const actual = await conn.execute<{ ID_CONDICION: number | null }>(
      `SELECT ID_CONDICION FROM CLIENTE WHERE ID_CLIENTE = :id FOR UPDATE`, { id });
    if (!actual.rows?.length) throw new NotFoundError(`Cliente ${id} no encontrado`);

    await validarCondicion(conn, input.idCondicion, actual.rows[0].ID_CONDICION);
    await validarNitUnico(conn, input.nit, id);

    await conn.execute(
      `UPDATE CLIENTE
          SET NOMBRE = :nombre, NIT = :nit, DIRECCION = :direccion, ID_CONDICION = :idCondicion, ESTADO = :estado
        WHERE ID_CLIENTE = :id`,
      { nombre: input.nombre, nit: input.nit, direccion: input.direccion, idCondicion: input.idCondicion, estado: input.estado, id },
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (esNitDuplicado(err)) throw new ConflictError('El NIT ya está registrado para otro cliente.');
    throw err;
  } finally {
    await conn.close();
  }
}
