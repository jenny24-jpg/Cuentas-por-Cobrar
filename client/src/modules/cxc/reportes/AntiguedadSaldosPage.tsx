import { useMemo } from 'react';
import type { AntiguedadSaldosReporte } from '@erp/contracts';
import { ExportMenu } from '../../../shared/components/ExportMenu';
import type { ReportSpec } from '../../../shared/export/reportExport';
import { useApi } from '../analisis/useApi';
import { COLOR, Q, SEMAFORO_ANTIGUEDAD, pct } from '../analisis/format';
import { Encabezado, ErrorCaja, Esqueleto, Panel } from '../analisis/ui/Panel';
import { KpiCard } from '../analisis/ui/KpiCard';
import { BarraApilada, RankBars } from '../analisis/ui/charts';
import { DataGrid } from '../analisis/ui/DataGrid';
import { Medidor, SegmentoPill } from '../analisis/ui/Pills';
import { useDetalle } from '../analisis/detalle/DetalleHost';

const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const AntiguedadSaldosPage = () => {
  const { data: reporte, loading, error, reload } = useApi<AntiguedadSaldosReporte>('/cxc/reportes/antiguedad-saldos');
  const hoy = useMemo(hoyIso, []);
  const { abrir, host } = useDetalle({ desde: hoy, hasta: hoy });
  const t = reporte?.totales;
  const parte = (v: number) => (t && t.total > 0 ? (v / t.total) * 100 : 0);

  const tramos = t ? [
    { id: 'corriente', etiqueta: 'Al corriente', valor: t.corriente },
    { id: '1-30', etiqueta: '1 a 30 días', valor: t.dias1a30 },
    { id: '31-60', etiqueta: '31 a 60 días', valor: t.dias31a60 },
    { id: '61-90', etiqueta: '61 a 90 días', valor: t.dias61a90 },
    { id: '90+', etiqueta: 'Más de 90 días', valor: t.mas90 },
  ] : [];
  const vencida = t ? t.dias1a30 + t.dias31a60 + t.dias61a90 + t.mas90 : 0;

  const getSpec = (): ReportSpec | null => {
    if (!reporte || !t) return null;
    const p = (v: number) => (t.total > 0 ? Math.round((v / t.total) * 1000) / 10 : 0);
    return {
      filename: 'antiguedad-de-saldos', title: 'Antiguedad de Saldos', subtitle: 'Saldo pendiente por cliente segun dias de vencimiento', orientation: 'landscape',
      summary: [['Corriente', Q(t.corriente)], ['1-30 dias', Q(t.dias1a30)], ['31-60 dias', Q(t.dias31a60)], ['61-90 dias', Q(t.dias61a90)], ['+90 dias', Q(t.mas90)], ['Total cartera', Q(t.total)]],
      sections: [{
        title: 'Detalle por cliente',
        columns: [{ header: 'Cliente' }, { header: 'Segmento' }, { header: 'Corriente', type: 'money' }, { header: '1-30 dias', type: 'money' }, { header: '31-60 dias', type: 'money' }, { header: '61-90 dias', type: 'money' }, { header: '+90 dias', type: 'money' }, { header: 'Total', type: 'money' }, { header: '% cartera', type: 'percent' }],
        rows: reporte.clientes.map((c) => [c.nombreCliente, c.segmento ?? '', c.corriente, c.dias1a30, c.dias31a60, c.dias61a90, c.mas90, c.total, p(c.total)]),
        totals: ['TOTAL', '', t.corriente, t.dias1a30, t.dias31a60, t.dias61a90, t.mas90, t.total, 100],
      }],
    };
  };

  return (
    <div>
      <Encabezado
        titulo="Antigüedad de saldos"
        descripcion="Cuánto te debe cada cliente y hace cuántos días venció. Solo documentos con saldo; no incluye pagados ni anulados. Clic en un cliente para ver su ficha."
        acciones={<ExportMenu getSpec={getSpec} disabledReason={!reporte || reporte.clientes.length === 0 ? 'No hay saldos pendientes para exportar' : undefined} />}
      />
      {error && <ErrorCaja mensaje={error} onReintentar={reload} />}
      {loading && !reporte && <div className="space-y-4"><Esqueleto alto="h-[110px]" /><Esqueleto alto="h-80" /></div>}

      {reporte && t && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard etiqueta="Total cartera" valor={Q(t.total)} color={COLOR.tinta} nota={`${reporte.clientes.length} clientes con saldo`} />
            <KpiCard etiqueta="Cartera vencida" valor={Q(vencida)} color={SEMAFORO_ANTIGUEDAD[3]} nota={`${pct(parte(vencida))} de la cartera ya venció`} />
            <KpiCard etiqueta="Más de 90 días" valor={Q(t.mas90)} color={SEMAFORO_ANTIGUEDAD[4]} nota={`${pct(parte(t.mas90))} de la cartera, la más difícil de cobrar`} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <Panel className="xl:col-span-2" titulo="Distribución de la cartera" subtitulo="Proporción del saldo según los días vencidos; de verde (al corriente) a rojo (+90)" cargando={loading}>
              <BarraApilada etiqueta="Distribución de la cartera por antigüedad"
                segmentos={tramos.map((tr, i) => ({ clave: tr.id, etiqueta: tr.etiqueta, valor: tr.valor, color: SEMAFORO_ANTIGUEDAD[i] }))} vacio="No hay saldos pendientes." />
            </Panel>
            <Panel className="xl:col-span-3" titulo="Dónde se concentra la deuda" subtitulo="Los 6 clientes con más saldo y su segmento. Clic para ver su ficha" cargando={loading}>
              <RankBars
                items={[...reporte.clientes].sort((a, b) => b.total - a.total).slice(0, 6).map((c) => ({
                  clave: c.idCliente, etiqueta: c.nombreCliente, valor: c.total, secundario: pct(parte(c.total), 0),
                  color: c.mas90 > 0 ? SEMAFORO_ANTIGUEDAD[4] : c.total > c.corriente ? SEMAFORO_ANTIGUEDAD[3] : SEMAFORO_ANTIGUEDAD[0],
                  marca: <span className="flex w-8 shrink-0 justify-center"><SegmentoPill segmento={c.segmento} /></span>,
                }))}
                onSeleccionar={(i) => abrir({ tipo: 'cliente', id: Number(i.clave) })} vacio="No hay saldos pendientes." />
            </Panel>
          </div>

          <Panel titulo="Detalle por cliente" subtitulo="Ordena por cualquier columna; las más a la derecha son las más difíciles de cobrar" cargando={loading}>
              <DataGrid
                filas={reporte.clientes} clave={(c) => c.idCliente} porPagina={10} compacta ordenInicial={{ id: 'total', dir: 'desc' }}
                buscar={(c) => c.nombreCliente} placeholderBuscar="Buscar cliente…" vacio="No hay saldos pendientes."
                onFila={(c) => abrir({ tipo: 'cliente', id: c.idCliente })} etiquetaFila={(c) => `Ver ficha de ${c.nombreCliente}`}
                columnas={[
                  { id: 'n', encabezado: 'Cliente', valor: (c) => c.nombreCliente, render: (c) => <span className="font-medium text-slate-900">{c.nombreCliente}</span>, total: () => 'Total' },
                  { id: 's', encabezado: 'Seg.', valor: (c) => c.segmento ?? 'Z', render: (c) => <SegmentoPill segmento={c.segmento} /> },
                  { id: 'c', encabezado: 'Corriente', alinear: 'der', valor: (c) => c.corriente, render: (c) => Q(c.corriente), total: () => Q(t.corriente) },
                  { id: 'a', encabezado: '1-30', alinear: 'der', valor: (c) => c.dias1a30, render: (c) => Q(c.dias1a30), total: () => Q(t.dias1a30) },
                  { id: 'b', encabezado: '31-60', alinear: 'der', valor: (c) => c.dias31a60, render: (c) => Q(c.dias31a60), total: () => Q(t.dias31a60) },
                  { id: 'd', encabezado: '61-90', alinear: 'der', valor: (c) => c.dias61a90, render: (c) => Q(c.dias61a90), total: () => Q(t.dias61a90) },
                  { id: 'm', encabezado: '+90', alinear: 'der', valor: (c) => c.mas90, render: (c) => (c.mas90 > 0 ? <span className="font-semibold text-red-700">{Q(c.mas90)}</span> : Q(c.mas90)), total: () => Q(t.mas90) },
                  { id: 'total', encabezado: 'Total', alinear: 'der', valor: (c) => c.total, render: (c) => <strong>{Q(c.total)}</strong>, total: () => Q(t.total) },
                  {
                    id: 'p', encabezado: '% cartera', ancho: '110px', valor: (c) => c.total,
                    render: (c) => <span className="flex items-center gap-2"><Medidor valor={parte(c.total)} max={Math.max(...reporte.clientes.map((x) => parte(x.total)), 1)} etiqueta="Participación en la cartera" /><span className="w-10 text-right text-[12px] tabular-nums text-slate-600">{pct(parte(c.total))}</span></span>,
                  },
                ]} />
          </Panel>
        </div>
      )}
      {host}
    </div>
  );
};
