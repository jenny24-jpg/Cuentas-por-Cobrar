import type { EstadisticaCobranza } from '@erp/contracts';
import { ExportMenu } from '../../../shared/components/ExportMenu';
import type { ReportSpec } from '../../../shared/export/reportExport';
import { useApi } from '../analisis/useApi';
import { useFiltros } from '../analisis/useFiltros';
import { COLOR, COLOR_ESTADO, Q, Qc, entero, mesCorto, pct } from '../analisis/format';
import { FilterBar } from '../analisis/ui/FilterBar';
import { Encabezado, ErrorCaja, Esqueleto, Panel } from '../analisis/ui/Panel';
import { KpiCard } from '../analisis/ui/KpiCard';
import { BarraApilada, ColumnasAgrupadasChart, RankBars } from '../analisis/ui/charts';
import { DataGrid } from '../analisis/ui/DataGrid';
import { etiquetaEstado } from '../analisis/ui/Pills';

const colorEstado = (estado: string) => COLOR_ESTADO[estado.toUpperCase()] ?? COLOR.gris;
import { useDetalle } from '../analisis/detalle/DetalleHost';

export const EstadisticaCobranzaPage = () => {
  const { filtros, query, cambiar, limpiar, hayFiltrosExtra } = useFiltros('90d');
  const { data, loading, error, reload } = useApi<EstadisticaCobranza>('/cxc/reportes/estadistica-cobranza', { desde: query.desde, hasta: query.hasta });
  const { abrir, host } = useDetalle(query);

  const getSpec = (): ReportSpec | null => {
    if (!data) return null;
    const t = data.totales;
    return {
      filename: `estadistica-cobranza-${data.desde}_${data.hasta}`, title: 'Estadistica de Cobranza', subtitle: `Periodo ${data.desde} a ${data.hasta}`,
      summary: [['Indice de cobranza', pct(t.indiceCobranza)], ['Facturado', Q(t.facturado)], ['Cobrado', Q(t.cobrado)], ['Cartera total', Q(t.carteraTotal)], ['Cartera vencida', `${Q(t.carteraVencida)} (${pct(t.porcentajeVencida)})`], ['Dias de cartera', `${t.diasCartera} dias`]],
      sections: [
        { title: 'Facturado vs cobrado por mes', columns: [{ header: 'Periodo' }, { header: 'Facturado', type: 'money' }, { header: 'Cobrado', type: 'money' }, { header: 'Indice', type: 'percent' }], rows: data.porMes.map((m) => [mesCorto(m.periodo), m.facturado, m.cobrado, m.facturado > 0 ? Math.round((m.cobrado / m.facturado) * 1000) / 10 : 0]), totals: ['TOTAL', t.facturado, t.cobrado, t.indiceCobranza] },
        { title: 'Pagos por forma de pago', columns: [{ header: 'Forma de pago' }, { header: 'Pagos', type: 'int' }, { header: 'Monto', type: 'money' }], rows: data.porFormaPago.map((f) => [f.formaPago, f.pagos, f.monto]) },
        { title: 'Promesas de pago', columns: [{ header: 'Estado' }, { header: 'Cantidad', type: 'int' }, { header: 'Monto', type: 'money' }], rows: data.promesas.map((p) => [p.estado, p.cantidad, p.monto]) },
        { title: 'Gestiones de cobro', columns: [{ header: 'Resultado' }, { header: 'Cantidad', type: 'int' }], rows: data.gestiones.map((g) => [g.resultado, g.cantidad]) },
        { title: 'Convenios de pago', columns: [{ header: 'Estado' }, { header: 'Cantidad', type: 'int' }, { header: 'Deuda convenida', type: 'money' }], rows: data.convenios.map((c) => [c.estado, c.cantidad, c.monto]) },
      ],
    };
  };

  const t = data?.totales;
  const serie = data?.porMes.map((m) => ({ etiqueta: mesCorto(m.periodo), periodo: m.periodo, facturado: m.facturado, cobrado: m.cobrado })) ?? [];
  const verPagosDelMes = (periodo: string) => abrir({ tipo: 'pagos', titulo: `Pagos aplicados en ${mesCorto(periodo)}`, modo: 'periodo', valor: periodo });
  // Cumplimiento: cumplidas sobre las ya resueltas (las pendientes aún pueden cumplirse).
  const cuenta = (estado: string) => data?.promesas.find((p) => p.estado.toUpperCase() === estado)?.cantidad ?? 0;
  const resueltas = cuenta('CUMPLIDA') + cuenta('INCUMPLIDA');
  const cumplimiento = resueltas > 0 ? (cuenta('CUMPLIDA') / resueltas) * 100 : null;

  return (
    <div>
      <FilterBar filtros={filtros} onChange={cambiar} onLimpiar={limpiar} mostrarLimpiar={hayFiltrosExtra} cobrador={false} ruta={false}
        nota="La cartera es la de hoy; el resto corresponde al período" />
      <Encabezado
        titulo="Estadística de cobranza"
        descripcion="Qué tanto de lo facturado se cobra, cómo está la cartera y qué resultado dan las gestiones. Clic en un mes para ver los pagos que lo componen."
        acciones={<ExportMenu getSpec={getSpec} disabledReason={!data || data.porMes.length === 0 ? 'No hay datos en el período para exportar' : undefined} />}
      />
      {error && <ErrorCaja mensaje={error} onReintentar={reload} />}
      {loading && !data && <div className="space-y-4"><Esqueleto alto="h-[110px]" /><Esqueleto alto="h-80" /></div>}

      {data && t && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard etiqueta="Índice de cobranza" valor={pct(t.indiceCobranza)} color={COLOR.aqua}
              comparar={{ actual: t.indiceCobranza, anterior: data.anterior.indiceCobranza }} nota={`${Qc(t.cobrado)} cobrados de ${Qc(t.facturado)} facturados`} />
            <KpiCard etiqueta="Cobrado en el período" valor={Q(t.cobrado)} color={COLOR.azul}
              comparar={{ actual: t.cobrado, anterior: data.anterior.cobrado }} nota="Pagos aplicados confirmados" />
            <KpiCard etiqueta="Cartera vencida" valor={pct(t.porcentajeVencida)} color={COLOR.critico} nota={`${Q(t.carteraVencida)} de ${Q(t.carteraTotal)}`} />
            <KpiCard etiqueta="Días de cartera" valor={`${entero(t.diasCartera)} días`} color={COLOR.violeta} nota="Cartera ÷ venta diaria del período" />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2" titulo="Facturado vs. cobrado por mes" subtitulo="Pasa el cursor para ver el índice de cobranza del mes; clic en un mes para ver sus pagos" cargando={loading}>
              <ColumnasAgrupadasChart datos={serie} alto={260}
                series={[{ clave: 'facturado', etiqueta: 'Facturado', color: COLOR.naranja }, { clave: 'cobrado', etiqueta: 'Cobrado', color: COLOR.azul }]}
                extra={(d) => [{ etiqueta: 'Índice de cobranza', valor: Number(d.facturado) > 0 ? pct((Number(d.cobrado) / Number(d.facturado)) * 100) : '—' }]}
                onSeleccionar={(d) => verPagosDelMes(String(d.periodo))} />
            </Panel>
            <Panel titulo="Pagos por forma de pago" subtitulo="Dinero recibido en el período">
              <RankBars items={data.porFormaPago.map((f) => ({ clave: f.formaPago, etiqueta: f.formaPago, valor: f.monto, secundario: `${f.pagos} pagos` }))} vacio="Sin pagos en el período." />
            </Panel>
          </div>

          <Panel titulo="Mes por mes" subtitulo="Clic en una fila para ver los pagos aplicados de ese mes" cargando={loading}>
            <DataGrid
              filas={data.porMes} clave={(m) => m.periodo} porPagina={12} compacta vacio="Sin movimientos en el período."
              onFila={(m) => verPagosDelMes(m.periodo)} etiquetaFila={(m) => `Ver pagos de ${mesCorto(m.periodo)}`}
              columnas={[
                { id: 'p', encabezado: 'Período', valor: (m) => m.periodo, render: (m) => mesCorto(m.periodo), total: () => 'Total' },
                { id: 'f', encabezado: 'Facturado', alinear: 'der', valor: (m) => m.facturado, render: (m) => Q(m.facturado), total: () => Q(t.facturado) },
                { id: 'c', encabezado: 'Cobrado', alinear: 'der', valor: (m) => m.cobrado, render: (m) => <strong>{Q(m.cobrado)}</strong>, total: () => Q(t.cobrado) },
                { id: 'i', encabezado: 'Índice', alinear: 'der', valor: (m) => (m.facturado > 0 ? m.cobrado / m.facturado : 0), render: (m) => (m.facturado > 0 ? pct((m.cobrado / m.facturado) * 100) : '—'), total: () => pct(t.indiceCobranza) },
              ]} />
          </Panel>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel titulo="Promesas de pago" subtitulo="Compromisos registrados en el período">
              {cumplimiento !== null && (
                <p className="mb-3 text-[13px] text-slate-600">
                  <span className="text-[24px] font-semibold leading-none tracking-tight text-slate-900">{pct(cumplimiento)}</span>{' '}
                  cumplidas de las {entero(resueltas)} ya resueltas
                </p>
              )}
              <BarraApilada etiqueta="Promesas de pago por estado" formato={entero} vacio="Sin promesas en el período."
                segmentos={data.promesas.map((p) => ({ clave: p.estado, etiqueta: etiquetaEstado(p.estado), valor: p.cantidad, color: colorEstado(p.estado), detalle: Qc(p.monto) }))} />
            </Panel>
            <Panel titulo="Resultado de las gestiones" subtitulo="Qué pasó cuando se contactó al cliente">
              <RankBars items={data.gestiones.map((g) => ({ clave: g.resultado, etiqueta: etiquetaEstado(g.resultado), valor: g.cantidad }))} formato={entero} color={COLOR.aqua} vacio="Sin gestiones en el período." />
            </Panel>
            <Panel titulo="Convenios de pago" subtitulo="Acuerdos firmados en el período, por estado (deuda convenida al lado)">
              <BarraApilada etiqueta="Convenios de pago por estado" formato={entero} vacio="Sin convenios en el período."
                segmentos={data.convenios.map((c) => ({ clave: c.estado, etiqueta: etiquetaEstado(c.estado), valor: c.cantidad, color: colorEstado(c.estado), detalle: Qc(c.monto) }))} />
            </Panel>
          </div>
        </div>
      )}
      {host}
    </div>
  );
};
