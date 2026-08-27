import { getConnection } from '../../../config/database';
import type { CatalogoOption } from '@erp/contracts';

/**
 * Catálogos de solo lectura para poblar <Select> en formularios (cliente,
 * empleado, documento). CXC_CLIENTES, CXC_EMPLEADOS y CXC_DOCUMENTOS son
 * tablas núcleo sin dueño de módulo específico — este repositorio solo LEE,
 * nunca escribe. El CRUD real de Clientes/Empleados/Documentos lo construye
 * quien tenga esa área asignada.
 */

export async function listClientesActivos(search?: string): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    const whereClause = search ? `AND UPPER(NOMBRE) LIKE UPPER(:search)` : '';
    const result = await conn.execute<{ ID_CLIENTE: number; NOMBRE: string }>(
      `SELECT ID_CLIENTE, NOMBRE FROM CXC_CLIENTES
       WHERE ESTADO = 'A' ${whereClause}
       ORDER BY NOMBRE ASC
       FETCH FIRST 50 ROWS ONLY`,
      search ? { search: `%${search}%` } : {},
    );
    return (result.rows ?? []).map((r) => ({ id: r.ID_CLIENTE, label: r.NOMBRE }));
  } finally {
    await conn.close();
  }
}

export async function listEmpleadosActivos(): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ ID_EMPLEADO: number; NOMBRE: string; APELLIDO: string }>(
      `SELECT ID_EMPLEADO, NOMBRE, APELLIDO FROM CXC_EMPLEADOS
       WHERE ESTADO = 'A'
       ORDER BY NOMBRE ASC`,
    );
    return (result.rows ?? []).map((r) => ({ id: r.ID_EMPLEADO, label: `${r.NOMBRE} ${r.APELLIDO}` }));
  } finally {
    await conn.close();
  }
}

/** Documentos con saldo pendiente de un cliente específico (para asociar la gestión/promesa al documento correcto). */
export async function listDocumentosPendientesPorCliente(idCliente: number): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ ID_DOCUMENTO: number; SERIE: string; NUMERO_DOCUMENTO: string; SALDO: number }>(
      `SELECT ID_DOCUMENTO, SERIE, NUMERO_DOCUMENTO, SALDO FROM CXC_DOCUMENTOS
       WHERE ID_CLIENTE = :idCliente AND SALDO > 0
       ORDER BY FECHA_VENCIMIENTO ASC`,
      { idCliente },
    );
    return (result.rows ?? []).map((r) => ({
      id: r.ID_DOCUMENTO,
      label: `${r.SERIE ?? ''}-${r.NUMERO_DOCUMENTO ?? r.ID_DOCUMENTO} (saldo: ${r.SALDO})`,
    }));
  } finally {
    await conn.close();
  }
}
