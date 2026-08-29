import { getConnection } from '../../../config/database';
import type { CatalogoOption } from '@erp/contracts';

/**
 * Catálogos de solo lectura para poblar <Select> en formularios.
 * Este repositorio solo LEE las tablas relacionadas; no administra sus CRUD.
 */

export async function listClientesActivos(
  search?: string,
): Promise<CatalogoOption[]> {
  const conn = await getConnection();

  try {
    const whereClause = search
      ? `AND UPPER(NOMBRE) LIKE UPPER(:search)`
      : '';

    const result = await conn.execute<{
      ID_CLIENTE: number;
      NOMBRE: string;
    }>(
      `SELECT ID_CLIENTE, NOMBRE
       FROM CLIENTE
       WHERE ESTADO = 'A'
       ${whereClause}
       ORDER BY NOMBRE ASC
       FETCH FIRST 50 ROWS ONLY`,
      search ? { search: `%${search}%` } : {},
    );

    return (result.rows ?? []).map((r) => ({
      id: r.ID_CLIENTE,
      label: r.NOMBRE,
    }));
  } finally {
    await conn.close();
  }
}

export async function listEmpleadosActivos(): Promise<
  CatalogoOption[]
> {
  const conn = await getConnection();

  try {
    const result = await conn.execute<{
      ID_EMPLEADO: number;
      NOMBRE: string;
      APELLIDO: string;
    }>(
      `SELECT ID_EMPLEADO, NOMBRE, APELLIDO
       FROM CXC_EMPLEADOS
       WHERE ESTADO = 'A'
       ORDER BY NOMBRE ASC`,
    );

    return (result.rows ?? []).map((r) => ({
      id: r.ID_EMPLEADO,
      label: `${r.NOMBRE} ${r.APELLIDO}`,
    }));
  } finally {
    await conn.close();
  }
}

/**
 * Documentos con saldo pendiente de un cliente específico.
 */
export async function listDocumentosPendientesPorCliente(
  idCliente: number,
): Promise<CatalogoOption[]> {
  const conn = await getConnection();

  try {
    const result = await conn.execute<{
      ID_DOCUMENTO: number;
      SERIE: string | null;
      NUMERO_DOCUMENTO: string | null;
      SALDO: number;
    }>(
      `SELECT
         ID_DOCUMENTO,
         SERIE,
         NUMERO_DOCUMENTO,
         SALDO
       FROM CXC_DOCUMENTOS
       WHERE ID_CLIENTE = :idCliente
         AND SALDO > 0
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

/**
 * Notas de crédito activas disponibles para seleccionar
 * al registrar una aplicación de nota de crédito.
 */
export async function listNotasCreditoActivas(): Promise<
  CatalogoOption[]
> {
  const conn = await getConnection();

  try {
    const result = await conn.execute<{
      ID_NOTA_CREDITO: number;
      SERIE: string | null;
      NUMERO: string | null;
      MONTO: number;
    }>(
      `SELECT
         ID_NOTA_CREDITO,
         SERIE,
         NUMERO,
         MONTO
       FROM CXC_NOTAS_CREDITO
       WHERE ESTADO = 'ACTIVA'
       ORDER BY FECHA DESC, ID_NOTA_CREDITO DESC`,
    );

    return (result.rows ?? []).map((r) => {
      const identificador =
        [r.SERIE, r.NUMERO].filter(Boolean).join('-') ||
        `Nota #${r.ID_NOTA_CREDITO}`;

      return {
        id: r.ID_NOTA_CREDITO,
        label: `${identificador} (monto: ${r.MONTO})`,
      };
    });
  } finally {
    await conn.close();
  }
}