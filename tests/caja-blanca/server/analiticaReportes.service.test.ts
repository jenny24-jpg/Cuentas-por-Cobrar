import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analiticaRepo = vi.hoisted(() => ({
  cobradoresRaw: vi.fn(), riesgoRaw: vi.fn(), detalleCliente: vi.fn(), gestiones: vi.fn(), clienteBasico: vi.fn(),
  num: (v: unknown) => Number(v ?? 0) || 0,
  round2: (v: number) => Math.round(v * 100) / 100,
}));
const fiscalesRepo = vi.hoisted(() => ({ getLibroVentas: vi.fn(), getEstadisticaVentas: vi.fn(), getEstadisticaCobranza: vi.fn() }));
const reportesRepo = vi.hoisted(() => ({ getAntiguedadSaldos: vi.fn(), getEstadoCuenta: vi.fn() }));
const dashboardRepo = vi.hoisted(() => ({ obtenerDatosResumen: vi.fn() }));
vi.mock('../../../server/src/modules/cxc/repositories/analitica.repository', () => analiticaRepo);
vi.mock('../../../server/src/modules/cxc/repositories/reportesFiscales.repository', () => fiscalesRepo);
vi.mock('../../../server/src/modules/cxc/repositories/reportes.repository', () => reportesRepo);
vi.mock('../../../server/src/modules/cxc/repositories/dashboard.repository', () => dashboardRepo);

import * as analitica from '../../../server/src/modules/cxc/services/analitica.service';
import * as fiscales from '../../../server/src/modules/cxc/services/reportesFiscales.service';
import * as reportes from '../../../server/src/modules/cxc/services/reportes.service';
import * as dashboard from '../../../server/src/modules/cxc/services/dashboard.service';

const HOY = '2026-10-27';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
describe('analitica.resolverAlcance — filtros y período anterior', () => {
  it('por defecto: últimos 90 días hasta hoy y el período anterior de igual duración', () => {
    expect(analitica.resolverAlcance({})).toMatchObject({ desde: '2026-07-30', hasta: HOY, desdeAnt: '2026-05-01', hastaAnt: '2026-07-29' });
  });
  it('rango explícito', () => {
    expect(analitica.resolverAlcance({ desde: '2026-10-01', hasta: '2026-10-10' })).toMatchObject({ desdeAnt: '2026-09-21', hastaAnt: '2026-09-30' });
  });
  it.each([
    [{ desde: '2026-02-30', hasta: HOY }, /desde/],
    [{ desde: '2026-10-01', hasta: '2026-13-01' }, /hasta/],
    [{ desde: '2026-10-10', hasta: '2026-10-01' }, /posterior/],
    [{ desde: '2025-01-01', hasta: HOY }, /400 días/],
    [{ idEmpleado: 'x' }, /cobrador/],
    [{ idCliente: -1 }, /cliente/],
    [{ diaSemana: 8 }, /fuera de rango/],
    [{ diaMes: 32 }, /fuera de rango/],
    [{ tramo: 6 }, /fuera de rango/],
  ])('%o → 400', (q, mensaje) => {
    expect(() => analitica.resolverAlcance(q)).toThrow(mensaje);
  });
  it('base de ruta recortada a 150 caracteres', () => {
    expect(analitica.resolverAlcance({ baseRuta: `  ${'x'.repeat(200)}  ` }).baseRuta).toHaveLength(150);
  });
  it.fails('DEFECTO: "hasta" inválida sin "desde" debe dar 400 y no un error interno', () => {
    expect(() => analitica.resolverAlcance({ hasta: 'ayer' })).toThrow(/no es válida/);
  });
});

describe('analitica.cobradores — ranking', () => {
  it('ordena por cobrado, calcula participación, ticket, variación y efectividad', async () => {
    analiticaRepo.cobradoresRaw.mockResolvedValue({
      nombres: [{ ID: 3, NOMBRE: 'Ana López', CODIGO: 'E3' }],
      cobros: [
        { ID: 1, NOMBRE: 'Luis', CODIGO: 'E1', COBRADO: 300, COBRADO_ANT: 200, PAGOS: 3, CLIENTES: 2 },
        { ID: 2, NOMBRE: 'Marta', CODIGO: 'E2', COBRADO: 700, COBRADO_ANT: 0, PAGOS: 2, CLIENTES: 2 },
      ],
      gestiones: [{ ID: 1, TOTAL: 4, EFECTIVAS: 1 }, { ID: 3, TOTAL: 2, EFECTIVAS: 2 }],
      promesas: [{ ID: 2, TOTAL: 2, CUMPLIDAS: 1 }],
      rutas: [{ ID: 1, RUTAS: 1, PARADAS: 4, VISITADAS: 3 }],
    });
    const r = await analitica.cobradores({ desde: '2026-10-01', hasta: HOY });
    expect(r.cobradores.map((c) => [c.idEmpleado, c.posicion])).toEqual([[2, 1], [1, 2], [3, 3]]);
    const [marta, luis, ana] = r.cobradores;
    expect(marta).toMatchObject({ participacion: 70, ticketPromedio: 350, variacion: null });
    expect(luis).toMatchObject({ participacion: 30, ticketPromedio: 100, variacion: 50, efectividadGestion: 25, efectividadRuta: 75 });
    expect(ana).toMatchObject({ nombre: 'Ana López', cobrado: 0, efectividadGestion: 100 });
    expect(r.totales).toEqual({ cobrado: 1000, pagos: 5, gestiones: 6, cobradoresActivos: 3 });
  });
});

describe('analitica.clientesRiesgo — puntaje explicable', () => {
  const fila = (extra: Record<string, unknown>) => ({
    ID_CLIENTE: 1, NOMBRE: 'X', NIT: 'CF', SALDO_TOTAL: 1000, SALDO_VENCIDO: 1000, DOCS_VENC: 1, DIAS_MAX: 120,
    DIAS_PROM: 30, INCUMPLIDAS: 2, SIN_RESP: 2, FALLIDAS: 2, CONVENIOS: 1, ...extra,
  });
  it('peor caso: 100 puntos, CRÍTICO; cada factor topado en su máximo', async () => {
    analiticaRepo.riesgoRaw.mockResolvedValue([fila({ DIAS_MAX: 500, INCUMPLIDAS: 10 })]);
    const r = await analitica.clientesRiesgo({});
    expect(r.clientes[0]).toMatchObject({ score: 100, nivel: 'CRITICO' });
    expect(r.clientes[0].factores.map((f) => f.puntos)).toEqual([30, 15, 15, 15, 10, 10, 5]);
  });
  it.each([
    [{ DIAS_MAX: 0, SALDO_VENCIDO: 0, DIAS_PROM: 0, INCUMPLIDAS: 0, SIN_RESP: 0, FALLIDAS: 0, CONVENIOS: 0 }, 0, 'BAJO'],
    [{ DIAS_MAX: 60, SALDO_VENCIDO: 500, DIAS_PROM: null, INCUMPLIDAS: 1, SIN_RESP: 0, FALLIDAS: 0, CONVENIOS: 0 }, 42, 'MEDIO'], // 15 + 7.5 + 7.5 + 7.5 + 4 = 41.5
  ])('%o → %i %s', async (extra, score, nivel) => {
    analiticaRepo.riesgoRaw.mockResolvedValue([fila(extra), fila({ ID_CLIENTE: 2 })]);
    const r = await analitica.clientesRiesgo({});
    expect(r.clientes.find((c) => c.idCliente === 1)).toMatchObject({ score, nivel });
  });
  it('ordena por puntaje y cuenta niveles y saldo en riesgo', async () => {
    analiticaRepo.riesgoRaw.mockResolvedValue([fila({ ID_CLIENTE: 1, DIAS_MAX: 0, SALDO_VENCIDO: 0, DIAS_PROM: 0, INCUMPLIDAS: 0, SIN_RESP: 0, FALLIDAS: 0, CONVENIOS: 0 }), fila({ ID_CLIENTE: 2 })]);
    const r = await analitica.clientesRiesgo({});
    expect(r.clientes.map((c) => c.idCliente)).toEqual([2, 1]);
    expect(r.totales).toMatchObject({ clientes: 2, criticos: 1, bajos: 1, saldoVencido: 1000, saldoEnRiesgo: 1000 });
  });
});

describe('analitica.cliente360', () => {
  beforeEach(() => {
    analiticaRepo.detalleCliente.mockResolvedValue({ documentos: [] });
    analiticaRepo.gestiones.mockResolvedValue([]);
  });
  it('cliente sin saldo hoy: riesgo en cero con su historial', async () => {
    analiticaRepo.riesgoRaw.mockResolvedValue([]);
    analiticaRepo.clienteBasico.mockResolvedValue({ ID_CLIENTE: 9, NOMBRE: 'Sin deuda', NIT: 'CF' });
    const r = await analitica.cliente360(9, {});
    expect(r.riesgo).toMatchObject({ idCliente: 9, saldoVencido: 0, nivel: 'BAJO' });
  });
  it('cliente inexistente → 404', async () => {
    analiticaRepo.riesgoRaw.mockResolvedValue([]);
    analiticaRepo.clienteBasico.mockResolvedValue(null);
    await expect(analitica.cliente360(9, {})).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
describe('reportesFiscales.service', () => {
  it('libro de ventas: por defecto el mes actual; año o mes fuera de rango → 400', async () => {
    await fiscales.getLibroVentas();
    expect(fiscalesRepo.getLibroVentas).toHaveBeenCalledWith(2026, 10);
    await expect(fiscales.getLibroVentas('1999', '1')).rejects.toThrow(/año/);
    await expect(fiscales.getLibroVentas('2026', '13')).rejects.toThrow(/mes/);
  });
  it('estadísticas: por defecto 6 meses calendario; fechas inválidas o invertidas → 400', async () => {
    await fiscales.getEstadisticaVentas();
    expect(fiscalesRepo.getEstadisticaVentas).toHaveBeenCalledWith('2026-05-01', HOY);
    await fiscales.getEstadisticaCobranza('2026-01-01', '2026-03-31');
    expect(fiscalesRepo.getEstadisticaCobranza).toHaveBeenCalledWith('2026-01-01', '2026-03-31');
    await expect(fiscales.getEstadisticaVentas('2026-02-30')).rejects.toThrow(/desde/);
    await expect(fiscales.getEstadisticaCobranza(undefined, '31/12/2026')).rejects.toThrow(/hasta/);
    await expect(fiscales.getEstadisticaVentas('2026-10-10', '2026-10-01')).rejects.toThrow(/posterior/);
  });
  it('estadística por defecto en enero cruza al año anterior', async () => {
    vi.setSystemTime(new Date('2027-01-15T18:00:00Z'));
    await fiscales.getEstadisticaVentas();
    expect(fiscalesRepo.getEstadisticaVentas).toHaveBeenLastCalledWith('2026-08-01', '2027-01-15');
  });
});

describe('reportes.service y dashboard.service', () => {
  it('estado de cuenta: id inválido → 400; inexistente → 404', async () => {
    await expect(reportes.getEstadoCuenta(0)).rejects.toMatchObject({ statusCode: 400 });
    reportesRepo.getEstadoCuenta.mockResolvedValue(null);
    await expect(reportes.getEstadoCuenta(1)).rejects.toMatchObject({ statusCode: 404 });
    reportesRepo.getAntiguedadSaldos.mockResolvedValue({ tramos: [] });
    await expect(reportes.getAntiguedadSaldos()).resolves.toEqual({ tramos: [] });
  });
  it('dashboard: porcentaje vencido redondeado y 0 sin cartera', async () => {
    const raw = (carteraTotal: number, carteraVencida: number) => ({
      kpis: { carteraTotal, carteraVencida, documentosAbiertos: 4 }, documentosPorEstado: [], gestionesPorTipo: [], promesasPorEstado: [],
      conveniosPorEstado: [], moraActiva: 0, notasCreditoPorEstado: [], pagosPorEstado: [], pagosAplicadosPorMes: [], rutasPorEstado: [],
    });
    dashboardRepo.obtenerDatosResumen.mockResolvedValueOnce(raw(3000, 1000));
    expect((await dashboard.getResumen()).kpis).toMatchObject({ porcentajeVencida: 33.33, carteraTotal: 3000 });
    dashboardRepo.obtenerDatosResumen.mockResolvedValueOnce(raw(0, 0));
    expect((await dashboard.getResumen()).kpis.porcentajeVencida).toBe(0);
  });
});
