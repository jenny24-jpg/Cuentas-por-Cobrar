import type { Connection } from 'oracledb';
import type { ZonaCobro } from '@erp/contracts';
import { getConnection } from '../../../../config/database';

interface ZonaRow {
  ID_ZONA: number; CODIGO: string; NOMBRE: string; DEPARTAMENTO: string; MUNICIPIO: string; ZONA: string | null; ID_SUCURSAL: number | null;
}

const map = (r: ZonaRow): ZonaCobro => ({
  id: r.ID_ZONA, codigo: r.CODIGO, nombre: r.NOMBRE, departamento: r.DEPARTAMENTO,
  municipio: r.MUNICIPIO, zona: r.ZONA, idSucursal: r.ID_SUCURSAL,
});

/** Zonas activas para los selectores, agrupables por municipio. */
export async function listActivas(): Promise<ZonaCobro[]> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<ZonaRow>(
      `SELECT ID_ZONA, CODIGO, NOMBRE, DEPARTAMENTO, MUNICIPIO, ZONA, ID_SUCURSAL
         FROM CXC_ZONAS_COBRO
        WHERE ESTADO = 'A'
        ORDER BY DEPARTAMENTO, MUNICIPIO, CASE WHEN ZONA IS NULL THEN 0 ELSE 1 END, NOMBRE`,
    );
    return (r.rows ?? []).map(map);
  } finally {
    await conn.close();
  }
}

/** Zona activa con ese id, o null. Usa la conexión de quien llama si se pasa. */
export async function findActiva(idZona: number, conn?: Connection): Promise<ZonaCobro | null> {
  const c = conn ?? (await getConnection());
  try {
    const r = await c.execute<ZonaRow>(
      `SELECT ID_ZONA, CODIGO, NOMBRE, DEPARTAMENTO, MUNICIPIO, ZONA, ID_SUCURSAL
         FROM CXC_ZONAS_COBRO WHERE ID_ZONA = :idZona AND ESTADO = 'A'`,
      { idZona },
    );
    return r.rows?.[0] ? map(r.rows[0]) : null;
  } finally {
    if (!conn) await c.close();
  }
}

/** Texto comparable: mayúsculas, sin espacios sobrantes ni tildes (igual que UX_CXC_ZONA_TERRITORIO). */
const norm = (col: string) => `TRANSLATE(UPPER(TRIM(${col})), 'ÁÉÍÓÚÜ', 'AEIOUU')`;

/**
 * Expresión SQL (1/0): ¿el cliente pertenece a la zona de la ruta?
 *   rz = zona de la ruta (CXC_ZONAS_COBRO), cz = zona del cliente (CXC_ZONAS_COBRO).
 * - Ruta sin zona (anteriores a las zonas): todos pertenecen, como antes.
 * - Misma zona: pertenece.
 * - Ruta de municipio completo (rz.ZONA NULL): pertenecen las zonas de ese municipio.
 * Un cliente sin zona no pertenece a ninguna ruta con zona.
 */
export const EN_ZONA_SQL = `CASE
    WHEN rz.ID_ZONA IS NULL THEN 1
    WHEN cz.ID_ZONA = rz.ID_ZONA THEN 1
    WHEN rz.ZONA IS NULL AND cz.ID_ZONA IS NOT NULL
         AND ${norm('cz.DEPARTAMENTO')} = ${norm('rz.DEPARTAMENTO')}
         AND ${norm('cz.MUNICIPIO')} = ${norm('rz.MUNICIPIO')} THEN 1
    ELSE 0
  END`;
