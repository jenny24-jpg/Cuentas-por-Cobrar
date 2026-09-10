import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type {
  DocumentoHistorial,
  CreateDocumentoHistorialInput,
  UpdateDocumentoHistorialInput,
} from '@erp/contracts';

interface DocumentoHistorialRow {
  ID_HISTORIAL: number;
  ID_DOCUMENTO: number;
  ESTADO_ANTERIOR: string | null;
  ESTADO_NUEVO: string;
  FECHA: Date;
  ID_EMPLEADO: number;
  NOMBRE_EMPLEADO: string | null;
}

function mapRow(row: DocumentoHistorialRow): DocumentoHistorial {
  return {
    idHistorial: row.ID_HISTORIAL,
    idDocumento: row.ID_DOCUMENTO,
    estadoAnterior: row.ESTADO_ANTERIOR,
    estadoNuevo: row.ESTADO_NUEVO,
    fecha: row.FECHA?.toISOString() ?? '',
    idEmpleado: row.ID_EMPLEADO,
    nombreEmpleado: row.NOMBRE_EMPLEADO,
  };
}

const SELECT_BASE = `
  SELECT h.ID_HISTORIAL,
         h.ID_DOCUMENTO,
         h.ESTADO_ANTERIOR,
         h.ESTADO_NUEVO,
         h.FECHA,
         h.ID_EMPLEADO,
         (e.NOMBRE || ' ' || e.APELLIDO) AS NOMBRE_EMPLEADO
    FROM CXC_DOCUMENTO_HISTORIAL h
    LEFT JOIN EMPLEADO e ON e.ID_EMPLEADO = h.ID_EMPLEADO
`;

export async function findByDocumento(idDocumento: number): Promise<DocumentoHistorial[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<DocumentoHistorialRow>(
      `${SELECT_BASE}
       WHERE h.ID_DOCUMENTO = :idDocumento
       ORDER BY h.FECHA DESC, h.ID_HISTORIAL DESC`,
      { idDocumento },
    );
    return (result.rows ?? []).map(mapRow);
  } finally {
    await conn.close();
  }
}

export async function findById(id: number): Promise<DocumentoHistorial | null> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<DocumentoHistorialRow>(
      `${SELECT_BASE} WHERE h.ID_HISTORIAL = :id`,
      { id },
    );
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}

export async function create(input: CreateDocumentoHistorialInput): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ id: number[] }>(
      `INSERT INTO CXC_DOCUMENTO_HISTORIAL
         (ID_DOCUMENTO, ESTADO_ANTERIOR, ESTADO_NUEVO, FECHA, ID_EMPLEADO)
       VALUES
         (:idDocumento, :estadoAnterior, :estadoNuevo,
          NVL(TO_DATE(:fecha, 'YYYY-MM-DD'), SYSDATE), :idEmpleado)
       RETURNING ID_HISTORIAL INTO :id`,
      {
        idDocumento: input.idDocumento,
        estadoAnterior: input.estadoAnterior ?? null,
        estadoNuevo: input.estadoNuevo,
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

export async function update(id: number, input: UpdateDocumentoHistorialInput): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, any> = { id };

  if (input.estadoAnterior !== undefined) { fields.push('ESTADO_ANTERIOR = :estadoAnterior'); binds.estadoAnterior = input.estadoAnterior; }
  if (input.estadoNuevo !== undefined) { fields.push('ESTADO_NUEVO = :estadoNuevo'); binds.estadoNuevo = input.estadoNuevo; }
  if (input.fecha !== undefined) {
    fields.push(`FECHA = TO_DATE(:fecha, 'YYYY-MM-DD')`);
    binds.fecha = input.fecha;
  }
  if (input.idEmpleado !== undefined) { fields.push('ID_EMPLEADO = :idEmpleado'); binds.idEmpleado = input.idEmpleado; }

  if (fields.length === 0) return;

  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE CXC_DOCUMENTO_HISTORIAL SET ${fields.join(', ')} WHERE ID_HISTORIAL = :id`,
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
      `DELETE FROM CXC_DOCUMENTO_HISTORIAL WHERE ID_HISTORIAL = :id`,
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
