import type { Connection } from 'oracledb';
import { getConnection } from '../../../config/database';
import type { EstadisticaCobranza, EstadisticaVentas, LibroVentasReporte } from '@erp/contracts';

/**
 * Reportes fiscales y estadísticos (solo lectura): libro de ventas, estadística
 * de ventas y estadística de cobranza. Mismo criterio que reportes.repository.ts:
 * consultas directas, una conexión por reporte, sin escribir nada.
 */

const num = (v: unknown) => Number(v ?? 0);
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

const DIA_MS = 86_400_000;
const isoDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Período inmediato anterior con la misma cantidad de días (en UTC para no mover el día). */
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const d = Date.parse(`${desde}T00:00:00Z`);
  const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - d) / DIA_MS) + 1;
  return { desde: isoDe(d - dias * DIA_MS), hasta: isoDe(d - DIA_MS) };
}

/** Todos los meses del rango como 'YYYY-MM', para que un mes sin movimiento salga en cero. */
export function mesesDelRango(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [y, m] = desde.split('-').map(Number);
  const [yh, mh] = hasta.split('-').map(Number);
  while (y < yh || (y === yh && m <= mh)) {
    meses.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return meses;
}

export async function getLibroVentas(anio: number, mes: number): Promise<LibroVentasReporte> {
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const conn = await getConnection();
  try {
    const result = await conn.execute<{
      FECHA_EMISION: Date; SERIE_FEL: string; NUMERO_FEL: number; UUID_AUTORIZACION: string; NIT_RECEPTOR: string;
      NOMBRE_RECEPTOR: string; ESTADO: 'CERTIFICADA' | 'ANULADA'; SUBTOTAL_GRAVADO: number; IVA: number; TOTAL: number;
    }>(
      `SELECT FECHA_EMISION, SERIE_FEL, NUMERO_FEL, UUID_AUTORIZACION, NIT_RECEPTOR, NOMBRE_RECEPTOR, ESTADO,
              SUBTOTAL_GRAVADO, IVA, TOTAL
         FROM CXC_FACTURA_FEL
        WHERE FECHA_EMISION >= TO_DATE(:desde, 'YYYY-MM-DD')
          AND FECHA_EMISION < ADD_MONTHS(TO_DATE(:desde, 'YYYY-MM-DD'), 1)
        ORDER BY FECHA_EMISION, SERIE_FEL, NUMERO_FEL`,
      { desde },
    );

    const filas = (result.rows ?? []).map((r) => {
      const anulada = r.ESTADO === 'ANULADA';
      return {
        fecha: r.FECHA_EMISION.toISOString(),
        serie: r.SERIE_FEL,
        numero: r.NUMERO_FEL,
        uuid: r.UUID_AUTORIZACION,
        nitReceptor: r.NIT_RECEPTOR,
        nombreReceptor: r.NOMBRE_RECEPTOR,
        estado: r.ESTADO,
        // Una factura anulada se lista en el libro, pero con valores en cero.
        baseGravada: anulada ? 0 : num(r.SUBTOTAL_GRAVADO),
        iva: anulada ? 0 : num(r.IVA),
        total: anulada ? 0 : num(r.TOTAL),
      };
    });

    const totales = filas.reduce(
      (acc, f) => ({
        facturas: acc.facturas + 1,
        anuladas: acc.anuladas + (f.estado === 'ANULADA' ? 1 : 0),
        baseGravada: round2(acc.baseGravada + f.baseGravada),
        iva: round2(acc.iva + f.iva),
        total: round2(acc.total + f.total),
      }),
      { facturas: 0, anuladas: 0, baseGravada: 0, iva: 0, total: 0 },
    );
    return { anio, mes, filas, totales };
  } finally {
    await conn.close();
  }
}

const RANGO_VENTAS = `f.FECHA_EMISION >= TO_DATE(:desde, 'YYYY-MM-DD') AND f.FECHA_EMISION <= TO_DATE(:hasta, 'YYYY-MM-DD')`;

/** Totales de facturas FEL de un período (también se usa para el período anterior). */
async function totalesVentas(conn: Connection, binds: { desde: string; hasta: string }): Promise<EstadisticaVentas['totales']> {
  const tot = await conn.execute<{ FACTURAS: number; ANULADAS: number; NETO: number; IVA: number; TOTAL: number }>(
      `SELECT SUM(CASE WHEN f.ESTADO = 'CERTIFICADA' THEN 1 ELSE 0 END) AS FACTURAS,
              SUM(CASE WHEN f.ESTADO = 'ANULADA' THEN 1 ELSE 0 END) AS ANULADAS,
              NVL(SUM(CASE WHEN f.ESTADO = 'CERTIFICADA' THEN f.SUBTOTAL_GRAVADO END), 0) AS NETO,
              NVL(SUM(CASE WHEN f.ESTADO = 'CERTIFICADA' THEN f.IVA END), 0) AS IVA,
              NVL(SUM(CASE WHEN f.ESTADO = 'CERTIFICADA' THEN f.TOTAL END), 0) AS TOTAL
         FROM CXC_FACTURA_FEL f WHERE ${RANGO_VENTAS}`,
      binds,
    );
  const t = tot.rows![0];
  const facturas = num(t.FACTURAS);
  const ventaTotal = num(t.TOTAL);
  return {
    facturas,
    anuladas: num(t.ANULADAS),
    ventaNeta: num(t.NETO),
    iva: num(t.IVA),
    ventaTotal,
    ticketPromedio: facturas > 0 ? round2(ventaTotal / facturas) : 0,
  };
}

export async function getEstadisticaVentas(desde: string, hasta: string): Promise<EstadisticaVentas> {
  const conn = await getConnection();
  const binds = { desde, hasta };
  const rango = RANGO_VENTAS;
  try {
    const totales = await totalesVentas(conn, binds);
    const previo = await totalesVentas(conn, periodoAnterior(desde, hasta));

    const meses = await conn.execute<{ PERIODO: string; FACTURAS: number; TOTAL: number }>(
      `SELECT TO_CHAR(f.FECHA_EMISION, 'YYYY-MM') AS PERIODO, COUNT(*) AS FACTURAS, SUM(f.TOTAL) AS TOTAL
         FROM CXC_FACTURA_FEL f WHERE ${rango} AND f.ESTADO = 'CERTIFICADA'
        GROUP BY TO_CHAR(f.FECHA_EMISION, 'YYYY-MM') ORDER BY PERIODO`,
      binds,
    );
    const clientes = await conn.execute<{ ID_CLIENTE: number; NOMBRE: string; SEGMENTO: string | null; FACTURAS: number; TOTAL: number }>(
      `SELECT d.ID_CLIENTE, c.NOMBRE, sg.CODIGO AS SEGMENTO, COUNT(*) AS FACTURAS, SUM(f.TOTAL) AS TOTAL
         FROM CXC_FACTURA_FEL f
         JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO = f.ID_DOCUMENTO
         JOIN CLIENTE c ON c.ID_CLIENTE = d.ID_CLIENTE
         LEFT JOIN CXC_CLIENTE_SEGMENTO cs ON cs.ID_CLIENTE = d.ID_CLIENTE
         LEFT JOIN CXC_SEGMENTOS_CLIENTE sg ON sg.ID_SEGMENTO = cs.ID_SEGMENTO
        WHERE ${rango} AND f.ESTADO = 'CERTIFICADA'
        GROUP BY d.ID_CLIENTE, c.NOMBRE, sg.CODIGO ORDER BY TOTAL DESC FETCH FIRST 10 ROWS ONLY`,
      binds,
    );
    const condiciones = await conn.execute<{ CONDICION: string; FACTURAS: number; TOTAL: number }>(
      `SELECT CASE WHEN NVL(cc.DIAS_CREDITO, 0) = 0 THEN 'Contado' ELSE 'Crédito ' || cc.DIAS_CREDITO || ' días' END AS CONDICION,
              COUNT(*) AS FACTURAS, SUM(f.TOTAL) AS TOTAL
         FROM CXC_FACTURA_FEL f
         JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO = f.ID_DOCUMENTO
         LEFT JOIN CXC_CONDICIONES_CREDITO cc ON cc.ID_CONDICION = d.ID_CONDICION_CREDITO
        WHERE ${rango} AND f.ESTADO = 'CERTIFICADA'
        GROUP BY CASE WHEN NVL(cc.DIAS_CREDITO, 0) = 0 THEN 'Contado' ELSE 'Crédito ' || cc.DIAS_CREDITO || ' días' END
        ORDER BY TOTAL DESC`,
      binds,
    );

    const porPeriodo = new Map((meses.rows ?? []).map((r) => [r.PERIODO, r]));
    return {
      desde,
      hasta,
      totales,
      anterior: { facturas: previo.facturas, ventaTotal: previo.ventaTotal, ticketPromedio: previo.ticketPromedio },
      porMes: mesesDelRango(desde, hasta).map((periodo) => {
        const r = porPeriodo.get(periodo);
        return { periodo, facturas: num(r?.FACTURAS), ventaTotal: num(r?.TOTAL) };
      }),
      topClientes: (clientes.rows ?? []).map((r) => ({ idCliente: r.ID_CLIENTE, nombreCliente: r.NOMBRE, segmento: r.SEGMENTO?.trim() || null, facturas: num(r.FACTURAS), ventaTotal: num(r.TOTAL) })),
      porCondicion: (condiciones.rows ?? []).map((r) => ({ condicion: r.CONDICION, facturas: num(r.FACTURAS), ventaTotal: num(r.TOTAL) })),
    };
  } finally {
    await conn.close();
  }
}

/** Facturado, cobrado e índice de un período, con el mismo criterio que la serie mensual. */
async function facturadoCobrado(conn: Connection, binds: { desde: string; hasta: string }): Promise<EstadisticaCobranza['anterior']> {
  const f = await conn.execute<{ MONTO: number }>(
    `SELECT NVL(SUM(TOTAL), 0) AS MONTO FROM CXC_DOCUMENTOS
      WHERE FECHA_DOCUMENTO >= TO_DATE(:desde, 'YYYY-MM-DD') AND FECHA_DOCUMENTO <= TO_DATE(:hasta, 'YYYY-MM-DD')
        AND UPPER(ESTADO) NOT IN ('ANULADO', 'ANULADA') AND ID_DOCUMENTO_ORIGEN IS NULL`,
    binds,
  );
  const c = await conn.execute<{ MONTO: number }>(
    `SELECT NVL(SUM(MONTO_APLICADO), 0) AS MONTO FROM CXC_APLICACION_PAGOS
      WHERE FECHA_APLICACION >= TO_DATE(:desde, 'YYYY-MM-DD') AND FECHA_APLICACION <= TO_DATE(:hasta, 'YYYY-MM-DD')
        AND ESTADO = 'CONFIRMADA'`,
    binds,
  );
  const facturado = round2(num(f.rows?.[0]?.MONTO));
  const cobrado = round2(num(c.rows?.[0]?.MONTO));
  return { facturado, cobrado, indiceCobranza: facturado > 0 ? round2((cobrado / facturado) * 100) : 0 };
}

export async function getEstadisticaCobranza(desde: string, hasta: string): Promise<EstadisticaCobranza> {
  const conn = await getConnection();
  const binds = { desde, hasta };
  const fecha = (col: string) => `${col} >= TO_DATE(:desde, 'YYYY-MM-DD') AND ${col} <= TO_DATE(:hasta, 'YYYY-MM-DD')`;
  try {
    const facturadoMes = await conn.execute<{ PERIODO: string; MONTO: number }>(
      `SELECT TO_CHAR(FECHA_DOCUMENTO, 'YYYY-MM') AS PERIODO, SUM(TOTAL) AS MONTO
         FROM CXC_DOCUMENTOS
        WHERE ${fecha('FECHA_DOCUMENTO')} AND UPPER(ESTADO) NOT IN ('ANULADO', 'ANULADA')
          AND ID_DOCUMENTO_ORIGEN IS NULL
        GROUP BY TO_CHAR(FECHA_DOCUMENTO, 'YYYY-MM')`,
      binds,
    );
    const cobradoMes = await conn.execute<{ PERIODO: string; MONTO: number }>(
      `SELECT TO_CHAR(FECHA_APLICACION, 'YYYY-MM') AS PERIODO, SUM(MONTO_APLICADO) AS MONTO
         FROM CXC_APLICACION_PAGOS
        WHERE ${fecha('FECHA_APLICACION')} AND ESTADO = 'CONFIRMADA'
        GROUP BY TO_CHAR(FECHA_APLICACION, 'YYYY-MM')`,
      binds,
    );
    const cartera = await conn.execute<{ TOTAL: number; VENCIDA: number }>(
      `SELECT NVL(SUM(SALDO), 0) AS TOTAL,
              NVL(SUM(CASE WHEN FECHA_VENCIMIENTO < TRUNC(SYSDATE) THEN SALDO ELSE 0 END), 0) AS VENCIDA
         FROM CXC_DOCUMENTOS
        WHERE SALDO > 0 AND UPPER(ESTADO) NOT IN ('ANULADO', 'ANULADA', 'PAGADO', 'PAGADA')`,
    );
    const formas = await conn.execute<{ FORMA: string; PAGOS: number; MONTO: number }>(
      `SELECT fp.NOMBRE AS FORMA, COUNT(*) AS PAGOS, SUM(p.MONTO) AS MONTO
         FROM CXC_PAGOS p JOIN CXC_FORMAS_PAGO fp ON fp.ID_FORMA_PAGO = p.ID_FORMA_PAGO
        WHERE ${fecha('p.FECHA_PAGO')} AND p.ESTADO NOT IN ('ANULADO', 'REVERSADO')
        GROUP BY fp.NOMBRE ORDER BY MONTO DESC`,
      binds,
    );
    const promesas = await conn.execute<{ ESTADO: string; CANTIDAD: number; MONTO: number }>(
      `SELECT ESTADO, COUNT(*) AS CANTIDAD, SUM(MONTO_COMPROMETIDO) AS MONTO
         FROM CXC_PROMESAS_PAGO WHERE ${fecha('FECHA_PROMESA')} GROUP BY ESTADO ORDER BY ESTADO`,
      binds,
    );
    const gestiones = await conn.execute<{ RESULTADO: string; CANTIDAD: number }>(
      `SELECT NVL(RESULTADO, 'Sin resultado') AS RESULTADO, COUNT(*) AS CANTIDAD
         FROM CXC_GESTIONES_COBRO WHERE ${fecha('FECHA_GESTION')}
        GROUP BY NVL(RESULTADO, 'Sin resultado') ORDER BY CANTIDAD DESC FETCH FIRST 8 ROWS ONLY`,
      binds,
    );
    const convenios = await conn.execute<{ ESTADO: string; CANTIDAD: number; MONTO: number }>(
      `SELECT ESTADO, COUNT(*) AS CANTIDAD, SUM(MONTO_DEUDA) AS MONTO
         FROM CXC_CONVENIOS_PAGO WHERE ${fecha('FECHA_CONVENIO')} GROUP BY ESTADO ORDER BY ESTADO`,
      binds,
    );

    const anterior = await facturadoCobrado(conn, periodoAnterior(desde, hasta));

    // Todos los meses del rango; los que no tuvieron facturación ni cobro quedan en cero.
    const facturadoPor = new Map((facturadoMes.rows ?? []).map((r) => [r.PERIODO, num(r.MONTO)]));
    const cobradoPor = new Map((cobradoMes.rows ?? []).map((r) => [r.PERIODO, num(r.MONTO)]));
    const porMes = mesesDelRango(desde, hasta).map((periodo) => ({ periodo, facturado: facturadoPor.get(periodo) ?? 0, cobrado: cobradoPor.get(periodo) ?? 0 }));

    const facturado = round2(porMes.reduce((a, m) => a + m.facturado, 0));
    const cobrado = round2(porMes.reduce((a, m) => a + m.cobrado, 0));
    const carteraTotal = num(cartera.rows?.[0]?.TOTAL);
    const carteraVencida = num(cartera.rows?.[0]?.VENCIDA);
    const dias = Math.max(1, Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1);

    return {
      desde,
      hasta,
      totales: {
        facturado,
        cobrado,
        indiceCobranza: facturado > 0 ? round2((cobrado / facturado) * 100) : 0,
        carteraTotal,
        carteraVencida,
        porcentajeVencida: carteraTotal > 0 ? round2((carteraVencida / carteraTotal) * 100) : 0,
        diasCartera: facturado > 0 ? Math.round(carteraTotal / (facturado / dias)) : 0,
      },
      anterior,
      porMes,
      porFormaPago: (formas.rows ?? []).map((r) => ({ formaPago: r.FORMA, pagos: num(r.PAGOS), monto: num(r.MONTO) })),
      promesas: (promesas.rows ?? []).map((r) => ({ estado: r.ESTADO, cantidad: num(r.CANTIDAD), monto: num(r.MONTO) })),
      gestiones: (gestiones.rows ?? []).map((r) => ({ resultado: r.RESULTADO, cantidad: num(r.CANTIDAD) })),
      convenios: (convenios.rows ?? []).map((r) => ({ estado: r.ESTADO, cantidad: num(r.CANTIDAD), monto: num(r.MONTO) })),
    };
  } finally {
    await conn.close();
  }
}
