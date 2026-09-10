import { getConnection } from '../../../config/database';
import type { CatalogoOption, FormaPagoOption } from '@erp/contracts';

/**
 * Catálogos de solo lectura para poblar <Select> en formularios.
 * Este repositorio solo LEE las tablas relacionadas; no administra sus CRUD.
 */

export async function listClientesActivos(search?: string): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    // Sin filtro de ESTADO por ahora.
    // CLIENTE.ESTADO existe, pero todavía no hay una regla confirmada
    // sobre qué valor representa "activo".
    const whereClause = search ? `WHERE UPPER(NOMBRE) LIKE UPPER(:search)` : '';

    const result = await conn.execute<{ ID_CLIENTE: number; NOMBRE: string }>(
      `SELECT ID_CLIENTE, NOMBRE FROM CLIENTE
       ${whereClause}
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
    // Sin filtro de ESTADO por ahora.
    // EMPLEADO.ESTADO existe, pero todavía no está confirmado
    // qué valor representa "activo".
    const result = await conn.execute<{ ID_EMPLEADO: number; NOMBRE: string; APELLIDO: string | null }>(
      `SELECT ID_EMPLEADO, NOMBRE, APELLIDO FROM EMPLEADO
       ORDER BY NOMBRE ASC`,
    );

    return (result.rows ?? []).map((r) => ({
      id: r.ID_EMPLEADO,
      label: `${r.NOMBRE} ${r.APELLIDO ?? ''}`.trim(),
    }));
  } finally {
    await conn.close();
  }
}

export async function listFormasPagoActivas(): Promise<FormaPagoOption[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ ID_FORMA_PAGO: number; NOMBRE: string; REQUIERE_REFERENCIA: string }>(
      `SELECT ID_FORMA_PAGO, NOMBRE, REQUIERE_REFERENCIA FROM CXC_FORMAS_PAGO
       WHERE ESTADO = 'A'
       ORDER BY NOMBRE ASC`,
    );
    return (result.rows ?? []).map((r) => ({
      id: r.ID_FORMA_PAGO,
      label: r.NOMBRE,
      requiereReferencia: r.REQUIERE_REFERENCIA === 'S',
    }));
  } finally {
    await conn.close();
  }
}

/**
 * Documentos con saldo pendiente de un cliente específico.
 */
export async function listDocumentosPendientesPorCliente(idCliente: number): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{
      ID_DOCUMENTO: number;
      SERIE: string | null;
      NUMERO_DOCUMENTO: string | null;
      SALDO: number;
    }>(
      `SELECT ID_DOCUMENTO, SERIE, NUMERO_DOCUMENTO, SALDO
       FROM CXC_DOCUMENTOS
       WHERE ID_CLIENTE = :idCliente
         AND SALDO > 0
       ORDER BY FECHA_VENCIMIENTO ASC`,
      { idCliente },
    );

    return (result.rows ?? []).map((r) => ({
      id: r.ID_DOCUMENTO,
      label: `${r.SERIE ?? ''}-${r.NUMERO_DOCUMENTO ?? r.ID_DOCUMENTO} (saldo: ${r.SALDO})`,
      saldo: r.SALDO,
    }));
  } finally {
    await conn.close();
  }
}

/**
 * Notas de crédito activas disponibles para seleccionar
 * al registrar una aplicación de nota de crédito.
 */
export async function listNotasCreditoActivas(): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{
      ID_NOTA_CREDITO: number;
      SERIE: string | null;
      NUMERO: string | null;
      MONTO: number;
    }>(
      `SELECT ID_NOTA_CREDITO, SERIE, NUMERO, MONTO
       FROM CXC_NOTAS_CREDITO
       WHERE ESTADO = 'ACTIVA'
       ORDER BY FECHA DESC, ID_NOTA_CREDITO DESC`,
    );

    return (result.rows ?? []).map((r) => {
      const identificador = [r.SERIE, r.NUMERO].filter(Boolean).join('-') || `Nota #${r.ID_NOTA_CREDITO}`;
      return {
        id: r.ID_NOTA_CREDITO,
        label: `${identificador} (monto: ${r.MONTO})`,
      };
    });
  } finally {
    await conn.close();
  }
}

/**
 * Monedas maestras para formularios de CxC.
 * Se usa el mismo catálogo MONEDA que Documentos.
 */
export async function listMonedas(): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{
      ID_MONEDA: number;
      CODIGO: string;
      NOMBRE: string | null;
    }>(
      `SELECT ID_MONEDA, CODIGO, NOMBRE
         FROM MONEDA
        ORDER BY CODIGO ASC`,
    );

    return (result.rows ?? []).map((r) => ({
      id: r.ID_MONEDA,
      label: r.NOMBRE ? `${r.CODIGO} — ${r.NOMBRE}` : r.CODIGO,
    }));
  } finally {
    await conn.close();
  }
}

/**
 * Verifica una relación documento-cliente sin confiar en el ID recibido
 * desde el navegador. Se usa en reglas de negocio de Cobranza/Crédito.
 */
export async function findDocumentoPendienteDeCliente(
  idCliente: number,
  idDocumento: number,
): Promise<CatalogoOption | null> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{
      ID_DOCUMENTO: number;
      SERIE: string | null;
      NUMERO_DOCUMENTO: string | null;
      SALDO: number;
    }>(
      `SELECT ID_DOCUMENTO, SERIE, NUMERO_DOCUMENTO, SALDO
         FROM CXC_DOCUMENTOS
        WHERE ID_DOCUMENTO = :idDocumento
          AND ID_CLIENTE = :idCliente
          AND SALDO > 0`,
      { idDocumento, idCliente },
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      id: row.ID_DOCUMENTO,
      label: `${row.SERIE ?? ''}-${row.NUMERO_DOCUMENTO ?? row.ID_DOCUMENTO}`,
      saldo: row.SALDO,
    };
  } finally {
    await conn.close();
  }
}

export async function clienteExiste(idCliente: number): Promise<boolean> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ TOTAL: number }>(
      'SELECT COUNT(*) AS TOTAL FROM CLIENTE WHERE ID_CLIENTE = :idCliente',
      { idCliente },
    );
    return (result.rows?.[0]?.TOTAL ?? 0) > 0;
  } finally {
    await conn.close();
  }
}

export async function empleadoExiste(idEmpleado: number): Promise<boolean> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ TOTAL: number }>(
      'SELECT COUNT(*) AS TOTAL FROM EMPLEADO WHERE ID_EMPLEADO = :idEmpleado',
      { idEmpleado },
    );
    return (result.rows?.[0]?.TOTAL ?? 0) > 0;
  } finally {
    await conn.close();
  }
}
