import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronDown, ChevronsDownUp, ChevronsUpDown, RefreshCw, Search } from 'lucide-react';
import { Button, TextInput } from '../../../shared/ui-kit';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { apiClient, ApiError } from '../../../shared/api';
import { formatDateGT } from '../../../shared/date';
import { DIAS_PROXIMOS_A_VENCER, type CarteraMoraDocumento, type EstadoCarteraMora } from '@erp/contracts';

type Vista = 'clientes' | 'atraso' | 'proximos';

const money = (value: number) => `Q ${Number(value).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const ESTADO: Record<EstadoCarteraMora, { label: string; badge: string; fila: string }> = {
  EN_MORA: { label: 'En mora', badge: 'border-red-200 bg-red-50 text-red-700', fila: 'bg-red-50/60 text-red-800' },
  EN_GRACIA: { label: 'Vencido (en gracia)', badge: 'border-amber-200 bg-amber-50 text-amber-800', fila: 'text-amber-900' },
  POR_VENCER: { label: 'Por vencer', badge: 'border-blue-200 bg-blue-50 text-blue-800', fila: '' },
  AL_DIA: { label: 'Al día', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', fila: '' },
};

const EstadoBadge = ({ estado }: { estado: EstadoCarteraMora }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${ESTADO[estado].badge}`}>
    {ESTADO[estado].label}
  </span>
);

const dias = (d: CarteraMoraDocumento) =>
  d.diasVencido > 0 ? plural(d.diasVencido, 'día vencido', 'días vencidos')
    : d.diasVencido === 0 ? 'Vence hoy'
      : `Vence en ${plural(-d.diasVencido, 'día', 'días')}`;

/** Tabla de documentos; las filas en mora van en rojo. */
function TablaDocumentos({ docs, mostrarCliente }: { docs: CarteraMoraDocumento[]; mostrarCliente?: boolean }) {
  if (docs.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-slate-500">No hay documentos en esta vista.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {mostrarCliente && <th className="px-3 py-2">Cliente</th>}
            <th className="px-3 py-2">Documento</th>
            <th className="px-3 py-2">Vencimiento</th>
            <th className="px-3 py-2">Mora desde</th>
            <th className="px-3 py-2">Atraso</th>
            <th className="px-3 py-2 text-right">Saldo pendiente</th>
            <th className="px-3 py-2 text-right">% mora</th>
            <th className="px-3 py-2 text-right">Monto mora</th>
            <th className="px-3 py-2">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {docs.map((d) => (
            <tr key={d.idDocumento} className={ESTADO[d.estado].fila}>
              {mostrarCliente && (
                <td className="px-3 py-2">
                  <span className="block font-medium">{d.cliente}</span>
                  <span className="text-xs opacity-70">{d.codigoCliente}</span>
                </td>
              )}
              <td className="px-3 py-2 font-medium">{d.documento}</td>
              <td className="px-3 py-2 tabular-nums">{formatDateGT(d.fechaVencimiento)}</td>
              <td className="px-3 py-2 tabular-nums" title={`Vencimiento + ${plural(d.diasGracia, 'día', 'días')} de gracia`}>
                {formatDateGT(d.fechaInicioMora)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{dias(d)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(d.saldo)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{d.porcentajeMora ? `${Number(d.porcentajeMora).toFixed(2)} %` : '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{d.montoMora ? money(d.montoMora) : '—'}</td>
              <td className="px-3 py-2"><EstadoBadge estado={d.estado} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Kpi = ({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle?: string; alerta?: boolean }) => (
  <div className={`rounded-xl border bg-white p-4 shadow-sm ${alerta ? 'border-red-200' : 'border-slate-200'}`}>
    <p className="text-xs font-medium text-slate-500">{titulo}</p>
    <p className={`mt-1 text-lg font-bold tabular-nums ${alerta ? 'text-red-700' : 'text-slate-900'}`}>{valor}</p>
    {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
  </div>
);

export const MoraPage = () => {
  const [docs, setDocs] = useState<CarteraMoraDocumento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('clientes');
  const [search, setSearch] = useState('');
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [confirmarGuardar, setConfirmarGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = () => {
    setCargando(true);
    setError(null);
    apiClient.get<CarteraMoraDocumento[]>('/cxc/mora/cartera')
      .then(setDocs)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar la cartera en mora'))
      .finally(() => setCargando(false));
  };
  useEffect(cargar, []);

  const filtrados = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return docs;
    return docs.filter((d) => `${d.cliente} ${d.codigoCliente} ${d.documento}`.toUpperCase().includes(q));
  }, [docs, search]);

  const grupos = useMemo(() => {
    const porCliente = new Map<number, { idCliente: number; cliente: string; codigo: string; docs: CarteraMoraDocumento[] }>();
    filtrados.forEach((d) => {
      const g = porCliente.get(d.idCliente) ?? { idCliente: d.idCliente, cliente: d.cliente, codigo: d.codigoCliente, docs: [] };
      g.docs.push(d);
      porCliente.set(d.idCliente, g);
    });
    return [...porCliente.values()]
      .map((g) => ({
        ...g,
        saldo: g.docs.reduce((s, d) => s + d.saldo, 0),
        saldoEnMora: g.docs.filter((d) => d.estado === 'EN_MORA').reduce((s, d) => s + d.saldo, 0),
        montoMora: g.docs.reduce((s, d) => s + d.montoMora, 0),
        enMora: g.docs.filter((d) => d.estado === 'EN_MORA').length,
        maxDias: Math.max(...g.docs.map((d) => d.diasVencido)),
      }))
      // Primero los clientes con más atraso.
      .sort((a, b) => b.maxDias - a.maxDias || b.saldo - a.saldo);
  }, [filtrados]);

  const totales = useMemo(() => ({
    saldo: filtrados.reduce((s, d) => s + d.saldo, 0),
    saldoEnMora: filtrados.filter((d) => d.estado === 'EN_MORA').reduce((s, d) => s + d.saldo, 0),
    montoMora: filtrados.reduce((s, d) => s + d.montoMora, 0),
    docsEnMora: filtrados.filter((d) => d.estado === 'EN_MORA').length,
    clientesEnMora: new Set(filtrados.filter((d) => d.estado === 'EN_MORA').map((d) => d.idCliente)).size,
    porVencer: filtrados.filter((d) => d.estado === 'POR_VENCER'),
  }), [filtrados]);

  const atrasados = filtrados.filter((d) => d.diasVencido > 0); // ya ordenados de mayor a menor atraso
  const proximos = [...totales.porVencer].sort((a, b) => b.diasVencido - a.diasVencido);
  const todosAbiertos = grupos.length > 0 && grupos.every((g) => abiertos.has(g.idCliente));

  const alternar = (id: number) => setAbiertos((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const guardarCalculo = async () => {
    setConfirmarGuardar(false);
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await apiClient.post<{ activas: number; cerradas: number }>('/cxc/mora/recalcular', {});
      setMensaje(`Cálculo guardado: ${plural(r.activas, 'documento en mora actualizado', 'documentos en mora actualizados')}, ${plural(r.cerradas, 'mora cerrada', 'moras cerradas')} por saldo pagado.`);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudo guardar el cálculo de mora');
    } finally {
      setGuardando(false);
    }
  };

  const tabs: { id: Vista; label: string; count: number }[] = [
    { id: 'clientes', label: 'Por cliente', count: grupos.length },
    { id: 'atraso', label: 'Mayor atraso', count: atrasados.length },
    { id: 'proximos', label: 'Próximos a vencer', count: proximos.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 text-sm font-bold">Mora</h1>
          <p className="text-sm text-slate-500">
            Todos los saldos pendientes con su mora calculada automáticamente. La mora corre desde la fecha de vencimiento más los días de gracia de la condición de crédito.
          </p>
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={() => setConfirmarGuardar(true)} disabled={guardando || cargando}>
          {guardando ? 'Guardando...' : 'Guardar cálculo de mora'}
        </Button>
      </div>

      {mensaje && (
        <p className="text-sm text-blue-700 font-medium bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">{mensaje}</p>
      )}
      {error && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Saldo pendiente" valor={money(totales.saldo)} detalle={plural(filtrados.length, 'documento', 'documentos')} />
        <Kpi titulo="Saldo en mora" valor={money(totales.saldoEnMora)} detalle={plural(totales.docsEnMora, 'documento', 'documentos')} alerta={totales.saldoEnMora > 0} />
        <Kpi titulo="Monto de mora" valor={money(totales.montoMora)} detalle="Saldo × % de mora" alerta={totales.montoMora > 0} />
        <Kpi titulo="Clientes en mora" valor={String(totales.clientesEnMora)} detalle={`${plural(totales.porVencer.length, 'documento vence', 'documentos vencen')} en ${DIAS_PROXIMOS_A_VENCER} días`} />
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TextInput
          icon={Search} maxLength={100}
          placeholder="Buscar por cliente, código de cobro o documento..."
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          className="sm:max-w-md"
        />
        <div role="tablist" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={vista === t.id}
              onClick={() => setVista(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${vista === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {t.label} <span className="ml-1 text-xs text-slate-500">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {cargando && docs.length === 0 ? (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando cartera">
          {[0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-xl border border-slate-200 bg-white" />)}
        </div>
      ) : vista === 'clientes' ? (
        grupos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            {search ? 'Ningún cliente coincide con la búsqueda.' : 'No hay saldos pendientes.'}
          </div>
        ) : (
          <div className={`space-y-3 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">{plural(grupos.length, 'cliente', 'clientes')} con saldo pendiente, ordenados por mayor atraso</p>
              {grupos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(grupos.map((g) => g.idCliente)))}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  {todosAbiertos ? <ChevronsDownUp size={16} aria-hidden="true" /> : <ChevronsUpDown size={16} aria-hidden="true" />}
                  {todosAbiertos ? 'Contraer todo' : 'Expandir todo'}
                </button>
              )}
            </div>
            {grupos.map((g) => {
              const abierto = abiertos.has(g.idCliente);
              return (
                <section key={g.idCliente} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${g.enMora ? 'border-red-200' : abierto ? 'border-blue-200' : 'border-slate-200'}`}>
                  <button
                    type="button"
                    onClick={() => alternar(g.idCliente)}
                    aria-expanded={abierto}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-slate-50"
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${g.enMora ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`} aria-hidden="true">
                      {g.enMora ? <AlertTriangle size={18} /> : <CalendarClock size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-semibold ${g.enMora ? 'text-red-800' : 'text-slate-900'}`}>{g.cliente}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{g.codigo}</span>
                        <span>{plural(g.docs.length, 'documento', 'documentos')}</span>
                        {g.enMora > 0 && <span className="font-medium text-red-700">{g.enMora} en mora · mayor atraso {plural(g.maxDias, 'día', 'días')}</span>}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right text-xs text-slate-500 sm:block">
                      Saldo <span className="block text-sm font-semibold text-slate-900 tabular-nums">{money(g.saldo)}</span>
                    </span>
                    <span className="hidden shrink-0 text-right text-xs text-slate-500 sm:block">
                      Mora <span className={`block text-sm font-semibold tabular-nums ${g.montoMora ? 'text-red-700' : 'text-slate-900'}`}>{money(g.montoMora)}</span>
                    </span>
                    <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {abierto && (
                    <div className="border-t border-slate-100">
                      <TablaDocumentos docs={g.docs} />
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
            {vista === 'atraso'
              ? 'Documentos vencidos, de mayor a menor número de días de atraso.'
              : `Documentos que vencen en los próximos ${DIAS_PROXIMOS_A_VENCER} días, del más cercano al más lejano.`}
          </p>
          <TablaDocumentos docs={vista === 'atraso' ? atrasados : proximos} mostrarCliente />
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmarGuardar}
        onClose={() => setConfirmarGuardar(false)}
        onConfirm={guardarCalculo}
        title="Guardar cálculo de mora"
        description="Se registrará la mora calculada de hoy para cada documento en mora y se cerrarán las moras de documentos ya pagados. ¿Continuar?"
        confirmLabel="Sí, guardar"
        variant="primary"
      />
    </div>
  );
};
