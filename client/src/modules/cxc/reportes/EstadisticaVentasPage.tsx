import type { EstadisticaVentas } from '@erp/contracts';
import { ExportMenu } from '../../../shared/components/ExportMenu';
import type { ReportSpec } from '../../../shared/export/reportExport';
import { useApi } from '../analisis/useApi';
import { useFiltros } from '../analisis/useFiltros';
import { COLOR, Q, entero, mesCorto, pct } from '../analisis/format';
import { FilterBar } from '../analisis/ui/FilterBar';
import { Encabezado, ErrorCaja, Esqueleto, Panel } from '../analisis/ui/Panel';
import { KpiCard } from '../analisis/ui/KpiCard';
import { ColumnasChart, RankBars } from '../analisis/ui/charts';
import { SegmentoPill } from '../analisis/ui/Pills';
import { useDetalle } from '../analisis/detalle/DetalleHost';

export const EstadisticaVentasPage = () => {
  const { filtros, query, cambiar, limpiar, hayFiltrosExtra } = useFiltros('90d');
  const { data, loading, error, reload } = useApi<EstadisticaVentas>('/cxc/reportes/estadistica-ventas', { desde: query.desde, hasta: query.hasta });
  const { abrir, host } = useDetalle(query);

  const getSpec = (): ReportSpec | null => {
    if (!data) return null;
    const t = data.totales;
    return {
      filename: `estadistica-ventas-${data.desde}_${data.hasta}`, title: 'Estadistica de Ventas', subtitle: `Periodo ${data.desde} a ${data.hasta}`,
      summary: [['Venta total', Q(t.ventaTotal)], ['Venta neta', Q(t.ventaNeta)], ['IVA facturado', Q(t.iva)], ['Ticket promedio', Q(t.ticketPromedio)], ['Facturas', String(t.facturas)], ['Anuladas', String(t.anuladas)]],
      sections: [
        { title: 'Ventas por mes', columns: [{ header: 'Periodo' }, { header: 'Facturas', type: 'int' }, { header: 'Venta total', type: 'money' }], rows: data.porMes.map((m) => [mesCorto(m.periodo), m.facturas, m.ventaTotal]), totals: ['TOTAL', t.facturas, t.ventaTotal] },
        { title: 'Mejores 10 clientes', columns: [{ header: 'Cliente' }, { header: 'Segmento' }, { header: 'Facturas', type: 'int' }, { header: 'Venta total', type: 'money' }], rows: data.topClientes.map((c) => [c.nombreCliente, c.segmento ?? '', c.facturas, c.ventaTotal]) },
        { title: 'Ventas por condicion de pago', columns: [{ header: 'Condicion' }, { header: 'Facturas', type: 'int' }, { header: 'Venta total', type: 'money' }], rows: data.porCondicion.map((c) => [c.condicion, c.facturas, c.ventaTotal]) },
      ],
    };
  };
  const t = data?.totales;

  return (
    <div>
      <FilterBar filtros={filtros} onChange={cambiar} onLimpiar={limpiar} mostrarLimpiar={hayFiltrosExtra} cobrador={false} ruta={false} nota="Solo facturas FEL certificadas" />
      <Encabezado
        titulo="Estadística de ventas"
        descripcion="Ventas facturadas del período, por mes, cliente y condición de pago. Clic en un cliente para ver su ficha completa."
        acciones={<ExportMenu getSpec={getSpec} disabledReason={!data || data.porMes.length === 0 ? 'No hay ventas en el período para exportar' : undefined} />}
      />
      {error && <ErrorCaja mensaje={error} onReintentar={reload} />}
      {loading && !data && <div className="space-y-4"><Esqueleto alto="h-[110px]" /><Esqueleto alto="h-80" /></div>}

      {data && t && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard etiqueta="Venta total" valor={Q(t.ventaTotal)} color={COLOR.azul} comparar={{ actual: t.ventaTotal, anterior: data.anterior.ventaTotal }} nota={`${entero(t.facturas)} facturas certificadas`} />
            <KpiCard etiqueta="Venta neta" valor={Q(t.ventaNeta)} color={COLOR.aqua} nota="Sin IVA" />
            <KpiCard etiqueta="IVA facturado" valor={Q(t.iva)} color={COLOR.naranja} nota="Débito fiscal" />
            <KpiCard etiqueta="Ticket promedio" valor={Q(t.ticketPromedio)} color={COLOR.violeta} comparar={{ actual: t.ticketPromedio, anterior: data.anterior.ticketPromedio }} nota={`${entero(t.anuladas)} facturas anuladas`} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2" titulo="Ventas por mes" subtitulo="Venta total facturada" cargando={loading}>
              <ColumnasChart etiquetaValor="Venta total" alto={250} datos={data.porMes.map((m) => ({ clave: m.periodo, etiqueta: mesCorto(m.periodo), valor: m.ventaTotal, extra: `${m.facturas} facturas` }))} />
            </Panel>
            <Panel titulo="Condición de pago" subtitulo="Cuánto se vende al contado y cuánto a crédito">
              <RankBars items={data.porCondicion.map((c) => ({ clave: c.condicion, etiqueta: c.condicion, valor: c.ventaTotal, secundario: `${c.facturas} fact.` }))} vacio="Sin ventas en el período." />
            </Panel>
          </div>

          <Panel titulo="Mejores clientes" subtitulo="Los 10 que más compran en el período, con su segmento (A, B, C o D) y su parte de la venta. Clic para ver su ficha" cargando={loading}>
            <RankBars
              items={data.topClientes.map((c) => ({
                clave: c.idCliente, etiqueta: c.nombreCliente, valor: c.ventaTotal,
                secundario: `${t.ventaTotal > 0 ? pct((c.ventaTotal / t.ventaTotal) * 100) : '—'} · ${entero(c.facturas)} fact.`,
                marca: <span className="flex w-8 shrink-0 justify-center"><SegmentoPill segmento={c.segmento} /></span>,
              }))}
              onDetalle={(i) => abrir({ tipo: 'cliente', id: Number(i.clave) })} vacio="Sin ventas en el período." />
          </Panel>
        </div>
      )}
      {host}
    </div>
  );
};
