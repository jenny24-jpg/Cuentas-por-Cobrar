import { describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as repo from '../../../server/src/modules/cxc/repositories/reportesFiscales.repository';
import * as reportes from '../../../server/src/modules/cxc/repositories/reportes.repository';

function conexion(r: Regla[]) {
  const c = crearConexion(r);
  db.getConnection.mockResolvedValue(c.conn);
  return c;
}

// ---------------------------------------------------------------------------
describe('reportes — rangos de fechas', () => {
  it('período anterior: misma cantidad de días, justo antes del rango', () => {
    expect(repo.periodoAnterior('2026-05-01', '2026-10-31')).toEqual({ desde: '2025-10-29', hasta: '2026-04-30' });
    expect(repo.periodoAnterior('2026-10-01', '2026-10-31')).toEqual({ desde: '2026-08-31', hasta: '2026-09-30' });
    expect(repo.periodoAnterior('2026-03-01', '2026-03-01')).toEqual({ desde: '2026-02-28', hasta: '2026-02-28' });
  });
  it('meses del rango: incluye los extremos y cruza el año', () => {
    expect(repo.mesesDelRango('2026-11-15', '2027-02-03')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(repo.mesesDelRango('2026-10-01', '2026-10-31')).toEqual(['2026-10']);
  });
});

// ---------------------------------------------------------------------------
describe('getEstadisticaVentas', () => {
  const reglas: Regla[] = [
    { sql: /SUM\(CASE WHEN f.ESTADO = 'CERTIFICADA' THEN 1/, rows: [{ FACTURAS: 4, ANULADAS: 1, NETO: 892.86, IVA: 107.14, TOTAL: 1000 }] },
    { sql: /TO_CHAR\(f.FECHA_EMISION, 'YYYY-MM'\)/, rows: [{ PERIODO: '2026-08', FACTURAS: 1, TOTAL: 250 }, { PERIODO: '2026-10', FACTURAS: 3, TOTAL: 750 }] },
    { sql: /sg.CODIGO AS SEGMENTO/, rows: [{ ID_CLIENTE: 303, NOMBRE: 'Adriana', SEGMENTO: 'A ', FACTURAS: 2, TOTAL: 600 }, { ID_CLIENTE: 24, NOMBRE: 'Carmen', SEGMENTO: null, FACTURAS: 1, TOTAL: 100 }] },
  ];

  it('meses sin ventas salen en cero y en orden', async () => {
    conexion(reglas);
    const r = await repo.getEstadisticaVentas('2026-08-01', '2026-10-31');
    expect(r.porMes).toEqual([
      { periodo: '2026-08', facturas: 1, ventaTotal: 250 },
      { periodo: '2026-09', facturas: 0, ventaTotal: 0 },
      { periodo: '2026-10', facturas: 3, ventaTotal: 750 },
    ]);
  });
  it('compara contra el período anterior de igual duración', async () => {
    const { ejecuto } = conexion(reglas);
    const r = await repo.getEstadisticaVentas('2026-10-01', '2026-10-31');
    const [actual, previo] = ejecuto(/SUM\(CASE WHEN f.ESTADO = 'CERTIFICADA' THEN 1/);
    expect(actual.binds).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(previo.binds).toEqual({ desde: '2026-08-31', hasta: '2026-09-30' });
    expect(r.anterior).toEqual({ facturas: 4, ventaTotal: 1000, ticketPromedio: 250 });
  });
  it('mejores clientes traen su segmento (sin espacios) o null', async () => {
    conexion(reglas);
    const r = await repo.getEstadisticaVentas('2026-10-01', '2026-10-31');
    expect(r.topClientes.map((c) => c.segmento)).toEqual(['A', null]);
  });
});

// ---------------------------------------------------------------------------
describe('getEstadisticaCobranza', () => {
  const reglas: Regla[] = [
    { sql: /TO_CHAR\(FECHA_DOCUMENTO, 'YYYY-MM'\)/, rows: [{ PERIODO: '2026-09', MONTO: 1000 }] },
    { sql: /TO_CHAR\(FECHA_APLICACION, 'YYYY-MM'\)/, rows: [{ PERIODO: '2026-10', MONTO: 400 }] },
    { sql: /SELECT NVL\(SUM\(TOTAL\), 0\) AS MONTO FROM CXC_DOCUMENTOS/, rows: [{ MONTO: 800 }] },
    { sql: /SELECT NVL\(SUM\(MONTO_APLICADO\), 0\) AS MONTO FROM CXC_APLICACION_PAGOS/, rows: [{ MONTO: 600 }] },
  ];

  it('todos los meses del rango, aunque solo tengan facturado o cobrado', async () => {
    conexion(reglas);
    const r = await repo.getEstadisticaCobranza('2026-08-01', '2026-10-31');
    expect(r.porMes).toEqual([
      { periodo: '2026-08', facturado: 0, cobrado: 0 },
      { periodo: '2026-09', facturado: 1000, cobrado: 0 },
      { periodo: '2026-10', facturado: 0, cobrado: 400 },
    ]);
    expect(r.totales).toMatchObject({ facturado: 1000, cobrado: 400, indiceCobranza: 40 });
  });
  it('período anterior con el mismo criterio que la serie (sin NDM hijas, solo aplicaciones confirmadas)', async () => {
    const { ejecuto } = conexion(reglas);
    const r = await repo.getEstadisticaCobranza('2026-10-01', '2026-10-31');
    const [fact] = ejecuto(/SELECT NVL\(SUM\(TOTAL\), 0\) AS MONTO FROM CXC_DOCUMENTOS/);
    expect(fact.binds).toEqual({ desde: '2026-08-31', hasta: '2026-09-30' });
    expect(fact.sql).toMatch(/ID_DOCUMENTO_ORIGEN IS NULL/);
    expect(ejecuto(/FROM CXC_APLICACION_PAGOS WHERE .*ESTADO = 'CONFIRMADA'/)).toHaveLength(2);
    expect(r.anterior).toEqual({ facturado: 800, cobrado: 600, indiceCobranza: 75 });
  });
});

// ---------------------------------------------------------------------------
describe('getAntiguedadSaldos — segmento del cliente', () => {
  it('trae el segmento por cliente y lo deja fuera de los totales', async () => {
    const { ejecuto } = conexion([{ sql: /FROM CXC_DOCUMENTOS d/, rows: [
      { ID_CLIENTE: 303, NOMBRE_CLIENTE: 'Adriana', SEGMENTO: 'D', CORRIENTE: 0, DIAS_1_30: 0, DIAS_31_60: 0, DIAS_61_90: 0, MAS_90: 500, TOTAL: 500 },
      { ID_CLIENTE: 24, NOMBRE_CLIENTE: 'Carmen', SEGMENTO: null, CORRIENTE: 100, DIAS_1_30: 0, DIAS_31_60: 0, DIAS_61_90: 0, MAS_90: 0, TOTAL: 100 },
    ] }]);
    const r = await reportes.getAntiguedadSaldos();
    expect(ejecuto(/GROUP BY d.ID_CLIENTE, c.NOMBRE, sg.CODIGO/)).toHaveLength(1);
    expect(r.clientes.map((c) => c.segmento)).toEqual(['D', null]);
    expect(r.totales).toEqual({ corriente: 100, dias1a30: 0, dias31a60: 0, dias61a90: 0, mas90: 500, total: 600 });
  });
});
