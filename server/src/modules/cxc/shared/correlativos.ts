import type { Connection } from 'oracledb';
import { BadRequestError, ConflictError } from '../../../shared/errors/AppError';

/**
 * Numeración interna del ERP (no es FEL/SAT). El correlativo sale del ID identity de la
 * fila recién insertada: lo asigna Oracle, es único y crece con cada registro, sin
 * secuencias ni columnas nuevas. Se llama dentro de la misma transacción del INSERT.
 *
 *   PAG-2026-000123   pagos (CXC_PAGOS.NUMERO_REFERENCIA)
 *   REC-2026-000081   recibos (CXC_RECIBOS.NUMERO_RECIBO)
 */
const CORRELATIVOS = {
  pago: { tabla: 'CXC_PAGOS', id: 'ID_PAGO', columna: 'NUMERO_REFERENCIA', fecha: 'FECHA_PAGO', prefijo: 'PAG' },
  recibo: { tabla: 'CXC_RECIBOS', id: 'ID_RECIBO', columna: 'NUMERO_RECIBO', fecha: 'FECHA', prefijo: 'REC' },
} as const;

export async function asignarCorrelativo(conn: Connection, tipo: keyof typeof CORRELATIVOS, id: number): Promise<void> {
  const c = CORRELATIVOS[tipo];
  await conn.execute(
    `UPDATE ${c.tabla}
        SET ${c.columna} = '${c.prefijo}-' || TO_CHAR(${c.fecha}, 'YYYY') || '-' || LPAD(TO_CHAR(:id), 6, '0')
      WHERE ${c.id} = :id`,
    { id },
  );
}

/**
 * La serie de las notas de crédito es el código del tipo de documento activo con
 * naturaleza CREDITO (CXC_TIPOS_DOCUMENTO); el número es el ID con ceros (NC-000006).
 * Si la base no tiene ese tipo, el equipo DBA debe registrarlo.
 */
export async function asignarNumeroNotaCredito(conn: Connection, id: number): Promise<void> {
  const tipo = await conn.execute<{ CODIGO: string }>(
    `SELECT TRIM(CODIGO) AS CODIGO FROM CXC_TIPOS_DOCUMENTO
      WHERE NATURALEZA = 'CREDITO' AND TRIM(ESTADO) = 'A'
      ORDER BY ID_TIPO_DOCUMENTO FETCH FIRST 1 ROWS ONLY`,
  );
  const serie = tipo.rows?.[0]?.CODIGO;
  if (!serie) {
    throw new BadRequestError('No hay un tipo de documento activo con naturaleza CREDITO para numerar la nota de crédito. Solicita al equipo DBA que lo registre.');
  }
  await conn.execute(
    `UPDATE CXC_NOTAS_CREDITO SET SERIE = :serie, NUMERO = LPAD(TO_CHAR(:id), 6, '0') WHERE ID_NOTA_CREDITO = :id`,
    { serie, id },
  );
}

/**
 * Siguiente número de documento dentro de su serie. La serie es la última serie de solo
 * letras que ya usa ese tipo (p. ej. FAC, para continuar la numeración existente) o, si
 * no tiene, el código del tipo. Bloquea la fila del tipo para que dos altas simultáneas
 * no tomen el mismo número; el bloqueo se libera con el commit/rollback de quien llama.
 */
export async function siguienteNumeroDocumento(
  conn: Connection,
  idTipoDocumento: number,
): Promise<{ serie: string; numero: string }> {
  let tipo;
  try {
    tipo = await conn.execute<{ CODIGO: string }>(
      `SELECT CODIGO FROM CXC_TIPOS_DOCUMENTO WHERE ID_TIPO_DOCUMENTO = :idTipoDocumento FOR UPDATE WAIT 5`,
      { idTipoDocumento },
    );
  } catch (err) {
    // ORA-30006: otra transacción tiene tomado el correlativo de este tipo.
    if ((err as { errorNum?: number }).errorNum === 30006) {
      throw new ConflictError('Otro usuario está registrando un documento de este tipo. Intenta de nuevo en unos segundos.');
    }
    throw err;
  }
  const codigo = tipo.rows?.[0]?.CODIGO?.trim();
  if (!codigo) throw new Error(`Tipo de documento ${idTipoDocumento} no encontrado`);
  const usada = await conn.execute<{ SERIE: string }>(
    `SELECT SERIE FROM CXC_DOCUMENTOS
      WHERE ID_TIPO_DOCUMENTO = :idTipoDocumento AND REGEXP_LIKE(SERIE, '^[A-Z]{1,10}$')
      ORDER BY ID_DOCUMENTO DESC FETCH FIRST 1 ROWS ONLY`,
    { idTipoDocumento },
  );
  const serie = usada.rows?.[0]?.SERIE ?? codigo;
  const max = await conn.execute<{ ULTIMO: number | null }>(
    // El CASE evita que Oracle intente convertir números heredados no numéricos.
    `SELECT MAX(CASE WHEN REGEXP_LIKE(NUMERO_DOCUMENTO, '^[0-9]{1,15}$') THEN TO_NUMBER(NUMERO_DOCUMENTO) END) AS ULTIMO
       FROM CXC_DOCUMENTOS
      WHERE SERIE = :serie`,
    { serie },
  );
  const siguiente = Number(max.rows?.[0]?.ULTIMO ?? 0) + 1;
  return { serie, numero: String(siguiente).padStart(8, '0') };
}
