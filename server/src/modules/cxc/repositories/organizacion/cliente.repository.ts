import oracledb, { type Connection } from 'oracledb';
import { getConnection } from '../../../../config/database';
import type { Cliente, ClienteResumen, CreateClienteInput, UpdateClienteInput } from '@erp/contracts';
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/errors/AppError';
import { roundMoney } from '../../shared/financialRules';

interface Row {
  ID_CLIENTE: number;
  CODIGO_CLIENTE: string | null;
  NOMBRE: string;
  NIT: string | null;
  DIRECCION: string | null;
  CODIGO_COBRO: string;
  ID_CONDICION: number | null;
  DIAS_CREDITO: number | null;
  DIAS_GRACIA: number | null;
  PORCENTAJE_MORA: number | null;
  ESTADO: string | null;
  ID_SEGMENTO: number | null;
  SEGMENTO: string | null;
  REDUCCION_MORA: number | null;
  ID_ZONA: number | null;
  ZONA: string | null;
  ZONA_CONFIRMADA: string | null;
}

const mapRow = (r: Row): Cliente => ({
  idCliente: r.ID_CLIENTE,
  codigoCliente: r.CODIGO_CLIENTE,
  nombre: r.NOMBRE,
  nit: r.NIT,
  direccion: r.DIRECCION,
  codigoCobro: r.CODIGO_COBRO,
  idCondicion: r.ID_CONDICION,
  diasCredito: r.DIAS_CREDITO,
  diasGracia: r.DIAS_GRACIA,
  porcentajeMora: r.PORCENTAJE_MORA,
  estado: r.ESTADO ? r.ESTADO.trim() : null,
  idSegmento: r.ID_SEGMENTO,
  segmento: r.SEGMENTO,
  reduccionMora: r.REDUCCION_MORA,
  idZona: r.ID_ZONA,
  zona: r.ZONA,
  zonaConfirmada: r.ZONA_CONFIRMADA === 'S',
});

const SELECT_BASE = `
  SELECT c.ID_CLIENTE, c.CODIGO_CLIENTE, c.NOMBRE, c.NIT, c.DIRECCION,
         'CR-' || LPAD(c.ID_CLIENTE, 5, '0') AS CODIGO_COBRO, c.ID_CONDICION,
         cc.DIAS_CREDITO, cc.DIAS_GRACIA, cc.PORCENTAJE_MORA,
         c.ESTADO,
         cs.ID_SEGMENTO, sg.CODIGO AS SEGMENTO, sg.REDUCCION_MORA,
         cu.ID_ZONA, zc.NOMBRE AS ZONA, cu.CONFIRMADA AS ZONA_CONFIRMADA
    FROM CLIENTE c
    LEFT JOIN CXC_CONDICIONES_CREDITO cc ON cc.ID_CONDICION = c.ID_CONDICION
    LEFT JOIN CXC_CLIENTE_SEGMENTO cs ON cs.ID_CLIENTE = c.ID_CLIENTE
    LEFT JOIN CXC_SEGMENTOS_CLIENTE sg ON sg.ID_SEGMENTO = cs.ID_SEGMENTO
    LEFT JOIN CXC_CLIENTE_UBICACION cu ON cu.ID_CLIENTE = c.ID_CLIENTE
    LEFT JOIN CXC_ZONAS_COBRO zc ON zc.ID_ZONA = cu.ID_ZONA
`;

/**
 * Guarda la zona de cobro del cliente en CXC_CLIENTE_UBICACION. Elegida por un usuario,
 * queda confirmada (CONFIRMADA = 'S'). null la quita; si tampoco hay punto en el mapa,
 * se borra la fila (la tabla exige zona o punto). Sin commit.
 */
async function guardarZona(conn: Connection, idCliente: number, idZona: number | null | undefined, idUsuario?: number) {
  if (idZona === undefined) return;
  if (idZona === null) {
    await conn.execute(`DELETE FROM CXC_CLIENTE_UBICACION WHERE ID_CLIENTE = :idCliente AND LATITUD IS NULL`, { idCliente });
    await conn.execute(
      `UPDATE CXC_CLIENTE_UBICACION SET ID_ZONA = NULL, FECHA_ACTUALIZACION = SYSDATE WHERE ID_CLIENTE = :idCliente`,
      { idCliente });
    return;
  }
  const zona = await conn.execute<{ ESTADO: string }>(
    `SELECT ESTADO FROM CXC_ZONAS_COBRO WHERE ID_ZONA = :idZona`, { idZona });
  if (!zona.rows?.length) throw new BadRequestError('La zona de cobro seleccionada no existe.');
  if (String(zona.rows[0].ESTADO).trim() !== 'A') throw new BadRequestError('La zona de cobro seleccionada está inactiva.');
  await conn.execute(
    `MERGE INTO CXC_CLIENTE_UBICACION u
     USING (SELECT :idCliente AS ID_CLIENTE, :idZona AS ID_ZONA, :idUsuario AS ID_USUARIO FROM DUAL) n
        ON (u.ID_CLIENTE = n.ID_CLIENTE)
      WHEN MATCHED THEN UPDATE SET u.ID_ZONA = n.ID_ZONA, u.CONFIRMADA = 'S',
           u.ID_USUARIO_ACTUALIZA = n.ID_USUARIO, u.FECHA_ACTUALIZACION = SYSDATE
      WHEN NOT MATCHED THEN INSERT (ID_CLIENTE, ID_ZONA, CONFIRMADA, ID_USUARIO_ACTUALIZA)
           VALUES (n.ID_CLIENTE, n.ID_ZONA, 'S', n.ID_USUARIO)`,
    { idCliente, idZona, idUsuario: idUsuario ?? null },
  );
}

/**
 * Guarda el segmento del cliente en CXC_CLIENTE_SEGMENTO (no se altera CLIENTE,
 * que comparten otros módulos). null quita el segmento. Sin commit.
 */
async function guardarSegmento(conn: Connection, idCliente: number, idSegmento: number | null | undefined) {
  if (idSegmento === undefined) return;
  if (idSegmento === null) {
    await conn.execute(`DELETE FROM CXC_CLIENTE_SEGMENTO WHERE ID_CLIENTE = :idCliente`, { idCliente });
    return;
  }
  const segmento = await conn.execute<{ ESTADO: string }>(
    `SELECT ESTADO FROM CXC_SEGMENTOS_CLIENTE WHERE ID_SEGMENTO = :idSegmento`, { idSegmento });
  if (!segmento.rows?.length) throw new BadRequestError('El segmento seleccionado no existe.');
  if (String(segmento.rows[0].ESTADO).trim() !== 'A') throw new BadRequestError('El segmento seleccionado está inactivo.');
  await conn.execute(
    `MERGE INTO CXC_CLIENTE_SEGMENTO cs
     USING (SELECT :idCliente AS ID_CLIENTE, :idSegmento AS ID_SEGMENTO FROM DUAL) n
        ON (cs.ID_CLIENTE = n.ID_CLIENTE)
      WHEN MATCHED THEN UPDATE SET cs.ID_SEGMENTO = n.ID_SEGMENTO
      WHEN NOT MATCHED THEN INSERT (ID_CLIENTE, ID_SEGMENTO) VALUES (n.ID_CLIENTE, n.ID_SEGMENTO)`,
    { idCliente, idSegmento },
  );
}

/** Segmentos activos para el selector de clientes. */
export async function listSegmentos(): Promise<Array<{ id: number; codigo: string; nombre: string; reduccionMora: number }>> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ ID_SEGMENTO: number; CODIGO: string; NOMBRE: string; REDUCCION_MORA: number }>(
      `SELECT ID_SEGMENTO, CODIGO, NOMBRE, REDUCCION_MORA FROM CXC_SEGMENTOS_CLIENTE
        WHERE TRIM(ESTADO) = 'A' ORDER BY CODIGO`,
    );
    return (result.rows ?? []).map((r) => ({
      id: r.ID_SEGMENTO, codigo: r.CODIGO, nombre: r.NOMBRE, reduccionMora: Number(r.REDUCCION_MORA),
    }));
  } finally {
    await conn.close();
  }
}

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
        OR UPPER(NVL(c.DIRECCION, '')) LIKE UPPER(:search) OR UPPER(NVL(c.CODIGO_CLIENTE, '')) LIKE UPPER(:search)
        OR TO_CHAR(c.ID_CLIENTE) = :searchExacto
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

/** ORA-00001 sobre el código de cliente: otro cliente tomó el mismo consecutivo; se recalcula y se reintenta. */
const esCodigoClienteRepetido = (err: unknown) =>
  esNitDuplicado(err) && String((err as Error).message).includes('UX_CLIENTE_CODIGO');

/** Siguiente código libre con el formato CLI-00001. */
async function siguienteCodigoCliente(conn: Connection): Promise<string> {
  const r = await conn.execute<{ C: string }>(`SELECT CODIGO_CLIENTE AS C FROM CLIENTE WHERE REGEXP_LIKE(CODIGO_CLIENTE, '^CLI-[0-9]+$')`);
  const max = (r.rows ?? []).reduce((m, x) => Math.max(m, Number(x.C.slice(4))), 0);
  return `CLI-${String(max + 1).padStart(5, '0')}`;
}

/** Crea el cliente; el ID lo asigna la columna identity y el código (CLI-00001) lo genera el servidor. */
export async function create(input: CreateClienteInput, idUsuario?: number): Promise<number> {
  const conn = await getConnection();
  try {
    await validarCondicion(conn, input.idCondicion, null);
    await validarNitUnico(conn, input.nit, null);
    for (let intento = 1; ; intento++) {
      try {
        const result = await conn.execute<{ id: number[] }>(
          `INSERT INTO CLIENTE (CODIGO_CLIENTE, NOMBRE, NIT, DIRECCION, ID_CONDICION, ESTADO)
           VALUES (:codigo, :nombre, :nit, :direccion, :idCondicion, :estado)
           RETURNING ID_CLIENTE INTO :id`,
          {
            codigo: await siguienteCodigoCliente(conn),
            nombre: input.nombre, nit: input.nit, direccion: input.direccion, idCondicion: input.idCondicion, estado: input.estado,
            id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          },
        );
        const idCliente = result.outBinds!.id[0];
        // El segmento va en la misma transacción que el alta del cliente.
        await guardarSegmento(conn, idCliente, input.idSegmento);
        await guardarZona(conn, idCliente, input.idZona, idUsuario);
        await conn.commit();
        return idCliente;
      } catch (err) {
        if (esCodigoClienteRepetido(err) && intento < 3) { await conn.rollback(); continue; }
        throw err;
      }
    }
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
export async function update(id: number, input: UpdateClienteInput & { nit: string }, idUsuario?: number): Promise<void> {
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
    await guardarSegmento(conn, id, input.idSegmento);
    await guardarZona(conn, id, input.idZona, idUsuario);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (esNitDuplicado(err)) throw new ConflictError('El NIT ya está registrado para otro cliente.');
    throw err;
  } finally {
    await conn.close();
  }
}
