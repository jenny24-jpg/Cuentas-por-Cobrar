import { getConnection } from '../../../config/database';
import type { CatalogoOption, FormaPagoOption } from '@erp/contracts';

/**
 * Catálogos de solo lectura para poblar <Select> en formularios.
 * Este repositorio solo LEE las tablas relacionadas; no administra sus CRUD.
 */

/** Documentos de cargo con saldo pendiente: los que un pago puede rebajar. */
const DOCUMENTOS_PENDIENTES_DEL_CLIENTE = `
  FROM CXC_DOCUMENTOS d
  LEFT JOIN CXC_TIPOS_DOCUMENTO t ON t.ID_TIPO_DOCUMENTO = d.ID_TIPO_DOCUMENTO
 WHERE d.ID_CLIENTE = CLIENTE.ID_CLIENTE
   AND d.SALDO > 0.005
   AND UPPER(NVL(d.ESTADO,'PENDIENTE')) NOT IN ('PAGADO','PAGADA','ANULADO','ANULADA')
   AND NVL(t.NATURALEZA, 'CARGO') = 'CARGO'`;

export async function listClientesActivos(
  search?: string,
  { conSaldo = false }: { conSaldo?: boolean } = {},
): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    if (conSaldo) {
      // Solo clientes que deben algo, con su código de cobro y el total pendiente.
      const result = await conn.execute<{ ID_CLIENTE: number; NOMBRE: string; CODIGO: string; SALDO: number }>(
        `SELECT ID_CLIENTE, NOMBRE, 'CR-' || LPAD(ID_CLIENTE, 5, '0') AS CODIGO,
                (SELECT SUM(d.SALDO) ${DOCUMENTOS_PENDIENTES_DEL_CLIENTE}) AS SALDO
           FROM CLIENTE
          WHERE EXISTS (SELECT 1 ${DOCUMENTOS_PENDIENTES_DEL_CLIENTE})
            ${search ? 'AND UPPER(NOMBRE) LIKE UPPER(:search)' : ''}
          ORDER BY NOMBRE ASC`,
        search ? { search: `%${search}%` } : {},
      );
      return (result.rows ?? []).map((r) => ({
        id: r.ID_CLIENTE,
        label: `${r.CODIGO} · ${r.NOMBRE} · debe Q ${Number(r.SALDO).toFixed(2)}`,
        saldo: Number(r.SALDO),
      }));
    }

    // Sin filtro de ESTADO por ahora.
    // CLIENTE.ESTADO existe, pero todavía no hay una regla confirmada
    // sobre qué valor representa "activo".
    const whereClause = search ? `WHERE UPPER(NOMBRE) LIKE UPPER(:search)` : '';

    const result = await conn.execute<{ ID_CLIENTE: number; NOMBRE: string }>(
      `SELECT ID_CLIENTE, NOMBRE FROM CLIENTE
       ${whereClause}
       ORDER BY NOMBRE ASC`,
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

export async function listBancosActivos(): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ BANCO_ID: number; CODIGO_BANCO: string | null; NOMBRE: string }>(
      `SELECT BANCO_ID, CODIGO_BANCO, NOMBRE FROM MB_BANCO
       WHERE ESTADO = 'ACTIVO'
       ORDER BY NOMBRE ASC`,
    );
    return (result.rows ?? []).map((r) => ({
      id: r.BANCO_ID,
      label: r.CODIGO_BANCO ? `${r.CODIGO_BANCO} — ${r.NOMBRE}` : r.NOMBRE,
    }));
  } finally {
    await conn.close();
  }
}

export async function bancoExiste(idBanco: number): Promise<boolean> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL FROM MB_BANCO WHERE BANCO_ID = :idBanco AND ESTADO = 'ACTIVO'`,
      { idBanco },
    );
    return (result.rows?.[0]?.TOTAL ?? 0) > 0;
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
    // Solo documentos de cargo (facturas, pagarés...): son los únicos que un pago,
    // anticipo o nota de crédito pueden rebajar.
    const result = await conn.execute<{
      ID_DOCUMENTO: number;
      TIPO: string | null;
      SERIE: string | null;
      NUMERO_DOCUMENTO: string | null;
      VENCE: string;
      VENCIDO: number;
      SALDO: number;
      ID_MONEDA: number;
    }>(
      `SELECT d.ID_DOCUMENTO, d.ID_MONEDA, t.NOMBRE AS TIPO, d.SERIE, d.NUMERO_DOCUMENTO,
              TO_CHAR(d.FECHA_VENCIMIENTO, 'DD/MM/YYYY') AS VENCE,
              CASE WHEN d.FECHA_VENCIMIENTO < TRUNC(SYSDATE) THEN 1 ELSE 0 END AS VENCIDO,
              d.SALDO
       FROM CXC_DOCUMENTOS d
       LEFT JOIN CXC_TIPOS_DOCUMENTO t ON t.ID_TIPO_DOCUMENTO = d.ID_TIPO_DOCUMENTO
       WHERE d.ID_CLIENTE = :idCliente
         AND d.SALDO > 0
         AND UPPER(NVL(d.ESTADO,'PENDIENTE')) NOT IN ('PAGADO','PAGADA','ANULADO','ANULADA')
         AND NVL(t.NATURALEZA, 'CARGO') = 'CARGO'
       ORDER BY d.FECHA_VENCIMIENTO ASC`,
      { idCliente },
    );

    return (result.rows ?? []).map((r) => ({
      id: r.ID_DOCUMENTO,
      label: `${r.TIPO ?? 'Documento'} ${[r.SERIE, r.NUMERO_DOCUMENTO ?? r.ID_DOCUMENTO].filter(Boolean).join('-')}`
        + ` · vence ${r.VENCE}${r.VENCIDO ? ' (VENCIDO)' : ''} · saldo Q ${Number(r.SALDO).toFixed(2)}`,
      saldo: r.SALDO,
      idMoneda: r.ID_MONEDA,
    }));
  } finally {
    await conn.close();
  }
}

/**
 * Notas de crédito con saldo disponible para aplicación.
 * Se conserva ACTIVA temporalmente como compatibilidad con datos heredados.
 */
export async function listNotasCreditoActivas(): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{
      ID_NOTA_CREDITO: number;
      ID_CLIENTE: number;
      SERIE: string | null;
      NUMERO: string | null;
      MONTO: number;
      DISPONIBLE: number;
    }>(
      `SELECT n.ID_NOTA_CREDITO,
              n.ID_CLIENTE,
              n.SERIE,
              n.NUMERO,
              n.MONTO,
              GREATEST(n.MONTO - NVL(SUM(a.MONTO_APLICADO),0),0) DISPONIBLE
         FROM CXC_NOTAS_CREDITO n
         LEFT JOIN CXC_APLICACION_NOTA_CREDITO a
           ON a.ID_NOTA_CREDITO = n.ID_NOTA_CREDITO AND a.ESTADO = 'CONFIRMADA'
        WHERE UPPER(NVL(n.ESTADO,'PENDIENTE')) IN ('PENDIENTE','ACTIVA')
          -- Solo notas aprobadas por un ADMIN pueden aplicarse a documentos.
          AND n.ID_EMPLEADO_APROBACION IS NOT NULL
        GROUP BY n.ID_NOTA_CREDITO,n.ID_CLIENTE,n.SERIE,n.NUMERO,n.MONTO,n.FECHA
       HAVING GREATEST(n.MONTO - NVL(SUM(a.MONTO_APLICADO),0),0) > 0
        ORDER BY n.FECHA DESC, n.ID_NOTA_CREDITO DESC`,
    );

    return (result.rows ?? []).map((r) => {
      const identificador = [r.SERIE, r.NUMERO].filter(Boolean).join('-') || `Nota #${r.ID_NOTA_CREDITO}`;
      return {
        id: r.ID_NOTA_CREDITO,
        idCliente: r.ID_CLIENTE,
        monto: r.MONTO,
        saldo: r.DISPONIBLE,
        label: `${identificador} · Disponible Q ${Number(r.DISPONIBLE).toFixed(2)}`,
      };
    });
  } finally {
    await conn.close();
  }
}

/**
 * Anticipos con saldo disponible de un cliente específico, para el selector
 * del formulario de "aplicar anticipo a documento".
 */
export async function listAnticiposDisponiblesPorCliente(idCliente: number): Promise<CatalogoOption[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{
      ID_ANTICIPO: number;
      MONTO_ORIGINAL: number;
      MONTO_DISPONIBLE: number;
      FECHA: Date;
    }>(
      `SELECT ID_ANTICIPO, MONTO_ORIGINAL, MONTO_DISPONIBLE, FECHA
         FROM CXC_ANTICIPOS
        WHERE ID_CLIENTE = :idCliente
          AND MONTO_DISPONIBLE > 0
          AND UPPER(ESTADO) IN ('DISPONIBLE', 'APLICADO')
        ORDER BY FECHA ASC`,
      { idCliente },
    );

    return (result.rows ?? []).map((r) => ({
      id: r.ID_ANTICIPO,
      label: `Anticipo #${r.ID_ANTICIPO} · original Q ${Number(r.MONTO_ORIGINAL).toFixed(2)} · disponible Q ${Number(r.MONTO_DISPONIBLE).toFixed(2)}`,
      monto: r.MONTO_ORIGINAL,
      saldo: r.MONTO_DISPONIBLE,
    }));
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

/**
 * Regla de negocio para convenios: el cliente debe tener al menos una promesa
 * incumplida o una mora vigente/activa asociada a un documento con saldo.
 *
 * Una promesa PENDIENTE cuya FECHA_COMPROMISO ya pasó se trata como
 * "efectivamente incumplida" aunque nadie haya editado su ESTADO todavía:
 * no existe ningún job/trigger que haga esa transición automáticamente
 * (ver server/src/modules/cxc/repositories/cobranza/promesaPago.repository.ts),
 * así que sin esto un cliente con una promesa vencida sin actualizar jamás
 * calificaría para un convenio.
 */
export async function clienteElegibleParaConvenio(idCliente: number): Promise<boolean> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ ELEGIBLE: number }>(
      `SELECT CASE
                WHEN EXISTS (
                  SELECT 1
                    FROM CXC_PROMESAS_PAGO p
                   WHERE p.ID_CLIENTE = :idCliente
                     AND (
                       UPPER(NVL(p.ESTADO, 'PENDIENTE')) = 'INCUMPLIDA'
                       OR (
                         UPPER(NVL(p.ESTADO, 'PENDIENTE')) = 'PENDIENTE'
                         AND p.FECHA_COMPROMISO IS NOT NULL
                         AND p.FECHA_COMPROMISO < TRUNC(SYSDATE)
                       )
                     )
                )
                  OR EXISTS (
                  SELECT 1
                    FROM CXC_MORA m
                    JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO = m.ID_DOCUMENTO
                   WHERE d.ID_CLIENTE = :idCliente
                     AND d.SALDO > 0
                     AND UPPER(NVL(m.ESTADO, 'ACTIVA')) = 'ACTIVA'
                )
                THEN 1 ELSE 0
              END AS ELEGIBLE
         FROM DUAL`,
      { idCliente },
    );
    return Number(result.rows?.[0]?.ELEGIBLE ?? 0) === 1;
  } finally {
    await conn.close();
  }
}
