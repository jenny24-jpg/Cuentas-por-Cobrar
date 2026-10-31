import type { Connection } from 'oracledb';
import { BadRequestError, ConflictError } from '../../../shared/errors/AppError';
import { businessTodayIso } from '../../../shared/date';

/**
 * Numeración anual interna del ERP (no es FEL/SAT): último correlativo del año
 * registrado más uno, con el mismo cálculo para la vista previa del formulario y
 * para el número definitivo.
 *
 *   PAG-2026-000082   pagos (CXC_PAGOS.NUMERO_REFERENCIA)
 *   REC-2026-000089   recibos (CXC_RECIBOS.NUMERO_RECIBO)
 */
const CORRELATIVOS = {
  pago: { tabla: 'CXC_PAGOS', columna: 'NUMERO_REFERENCIA', prefijo: 'PAG', registro: 'un pago' },
  recibo: { tabla: 'CXC_RECIBOS', columna: 'NUMERO_RECIBO', prefijo: 'REC', registro: 'un recibo' },
} as const;

/** ORA-30006: el recurso sigue tomado por otra transacción al vencer el WAIT. */
const esEsperaVencida = (err: unknown) => (err as { errorNum?: number })?.errorNum === 30006;

/**
 * Siguiente correlativo del año para pagos o recibos. Con bloqueo, toma la tabla en modo
 * exclusivo hasta el commit/rollback de quien llama, para que dos registros simultáneos
 * no repitan número; debe llamarse antes del INSERT. Sin bloqueo solo sirve como vista
 * previa. `anio` por defecto es el año de negocio actual.
 */
export async function siguienteCorrelativoAnual(
  conn: Connection,
  tipo: keyof typeof CORRELATIVOS,
  { bloquear = true, anio = businessTodayIso().slice(0, 4) }: { bloquear?: boolean; anio?: string } = {},
): Promise<string> {
  const c = CORRELATIVOS[tipo];
  if (bloquear) {
    try {
      await conn.execute(`LOCK TABLE ${c.tabla} IN EXCLUSIVE MODE WAIT 5`);
    } catch (err) {
      if (esEsperaVencida(err)) {
        throw new ConflictError(`Otro usuario está registrando ${c.registro}. Intenta de nuevo en unos segundos.`);
      }
      throw err;
    }
  }
  const prefijo = `${c.prefijo}-${anio}-`;
  const r = await conn.execute<{ ULTIMO: number | null }>(
    // El CASE evita convertir números heredados con otro formato.
    `SELECT MAX(CASE WHEN REGEXP_LIKE(${c.columna}, '^' || :prefijo || '[0-9]{1,9}$')
                     THEN TO_NUMBER(SUBSTR(${c.columna}, LENGTH(:prefijo) + 1)) END) AS ULTIMO
       FROM ${c.tabla}`,
    { prefijo },
  );
  return `${prefijo}${String(Number(r.rows?.[0]?.ULTIMO ?? 0) + 1).padStart(6, '0')}`;
}

/** Referencia del siguiente pago del año (PAG-2026-000082). */
export function siguienteReferenciaPago(conn: Connection, opciones: { bloquear?: boolean } = {}): Promise<string> {
  return siguienteCorrelativoAnual(conn, 'pago', opciones);
}

/**
 * Serie y número de la siguiente nota de crédito. La serie es el código del tipo de
 * documento activo con naturaleza CREDITO (CXC_TIPOS_DOCUMENTO); el número es el
 * último de esa serie más uno (NC-000007). Con bloqueo, toma CXC_NOTAS_CREDITO hasta
 * el commit de quien llama y debe llamarse antes del INSERT; sin bloqueo solo sirve
 * como vista previa. Si la base no tiene ese tipo, el equipo DBA debe registrarlo.
 */
export async function siguienteNumeroNotaCredito(
  conn: Connection,
  { bloquear = true }: { bloquear?: boolean } = {},
): Promise<{ serie: string; numero: string }> {
  const tipo = await conn.execute<{ CODIGO: string }>(
    `SELECT TRIM(CODIGO) AS CODIGO FROM CXC_TIPOS_DOCUMENTO
      WHERE NATURALEZA = 'CREDITO' AND TRIM(ESTADO) = 'A'
      ORDER BY ID_TIPO_DOCUMENTO FETCH FIRST 1 ROWS ONLY`,
  );
  const serie = tipo.rows?.[0]?.CODIGO;
  if (!serie) {
    throw new BadRequestError('No hay un tipo de documento activo con naturaleza CREDITO para numerar la nota de crédito. Solicita al equipo DBA que lo registre.');
  }
  if (bloquear) {
    try {
      await conn.execute('LOCK TABLE CXC_NOTAS_CREDITO IN EXCLUSIVE MODE WAIT 5');
    } catch (err) {
      if (esEsperaVencida(err)) {
        throw new ConflictError('Otro usuario está registrando una nota de crédito. Intenta de nuevo en unos segundos.');
      }
      throw err;
    }
  }
  const max = await conn.execute<{ ULTIMO: number | null }>(
    // El CASE evita convertir números heredados con otro formato.
    `SELECT MAX(CASE WHEN REGEXP_LIKE(NUMERO, '^[0-9]{1,15}$') THEN TO_NUMBER(NUMERO) END) AS ULTIMO
       FROM CXC_NOTAS_CREDITO
      WHERE SERIE = :serie`,
    { serie },
  );
  return { serie, numero: String(Number(max.rows?.[0]?.ULTIMO ?? 0) + 1).padStart(6, '0') };
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
  // Sin bloqueo solo sirve como vista previa en el formulario: el número definitivo
  // se calcula de nuevo, bloqueado, al guardar.
  { bloquear = true }: { bloquear?: boolean } = {},
): Promise<{ serie: string; numero: string }> {
  let tipo;
  try {
    tipo = await conn.execute<{ CODIGO: string }>(
      `SELECT CODIGO FROM CXC_TIPOS_DOCUMENTO WHERE ID_TIPO_DOCUMENTO = :idTipoDocumento${bloquear ? ' FOR UPDATE WAIT 5' : ''}`,
      { idTipoDocumento },
    );
  } catch (err) {
    // Otra transacción tiene tomado el correlativo de este tipo.
    if (esEsperaVencida(err)) {
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
