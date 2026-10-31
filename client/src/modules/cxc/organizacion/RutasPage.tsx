import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Pencil, Plus, Route as RouteIcon, Trash2 } from 'lucide-react';
import { DataTable, StatusBadge, Button, TextInput, Select } from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { usePaginatedList, useSucursales } from '../../../shared/hooks';
import { apiClient, ApiError, buildQueryString } from '../../../shared/api';
import { formatDateGT } from '../../../shared/date';
import type { Ruta, RutasPorEmpleado } from '@erp/contracts';
import { RutaForm } from './components/RutaForm';
import { PieTabla, useTamanoPagina } from '../../../shared/components/PieTabla';

const SEARCH_DEBOUNCE_MS = 300;

const iniciales = (nombre: string | null) =>
  (nombre ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

/** Foto del empleado; si no tiene o no carga, sus iniciales. */
function AvatarEmpleado({ nombre, fotoUrl }: { nombre: string | null; fotoUrl: string | null }) {
  const [fallo, setFallo] = useState(false);
  if (fotoUrl && !fallo) {
    return (
      <img src={fotoUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" onError={() => setFallo(true)}
        className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm" />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0e2238] text-sm font-semibold text-white" aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}

const plural = (n: number, singular: string, pluralTxt: string) => `${n} ${n === 1 ? singular : pluralTxt}`;

/** Chips con la cantidad de rutas por estado (solo los estados que tiene). */
function ResumenEstados({ g }: { g: RutasPorEmpleado }) {
  const chips = [
    { n: g.planificadas, txt: 'planificada', txtP: 'planificadas', cls: 'border-blue-200 bg-blue-50 text-blue-800' },
    { n: g.enProceso, txt: 'en proceso', txtP: 'en proceso', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    { n: g.completadas, txt: 'completada', txtP: 'completadas', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    { n: g.canceladas, txt: 'cancelada', txtP: 'canceladas', cls: 'border-slate-200 bg-slate-50 text-slate-500' },
  ].filter((c) => c.n > 0);
  return (
    <span className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.txt} className={`rounded-full border px-2 py-0.5 ${c.cls}`}>{plural(c.n, c.txt, c.txtP)}</span>
      ))}
    </span>
  );
}

/** Rutas de un empleado (segundo nivel), con la misma búsqueda de la pantalla. */
function RutasDelEmpleado({ idEmpleado, idSucursal, search, version, onEditar, onEliminar }: {
  idEmpleado: number;
  idSucursal?: number;
  search: string;
  version: number;
  onEditar: (ruta: Ruta) => void;
  onEliminar: (ruta: Ruta) => void;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanoPagina('cxc.organizacion.RutasPage');
  const { data, meta, isLoading, error, refetch } = usePaginatedList<Ruta>('/cxc/rutas', { page, limit: pageSize, search, idEmpleado, idSucursal });

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { if (version) refetch(); }, [version, refetch]);

  if (error) return <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>;

  return (
    <DataTable
      isLoading={isLoading}
      data={data}
      emptyText="Este empleado no tiene rutas que coincidan con la búsqueda"
      onRowClick={(row: any) => navigate(`/cxc/organizacion/rutas/${row.idRuta}`)}
      columns={[
        { header: 'Código', accessorKey: 'codigoRuta', cell: ({ value }: any) => <span className="font-medium text-slate-900">{value ?? '—'}</span> },
        { header: 'Nombre de la ruta', accessorKey: 'nombre' },
        { header: 'Sucursal', accessorKey: 'nombreSucursal', cell: ({ value }: any) => value ?? <span className="text-xs font-medium text-amber-700">Sin sucursal</span> },
        { header: 'Fecha planificada', accessorKey: 'fecha', cell: ({ value }: any) => formatDateGT(value) },
        { header: 'Estado', accessorKey: 'estado', cell: ({ value }: any) => (value ? <StatusBadge status={value} /> : '—') },
        {
          header: '',
          align: 'right',
          cell: ({ row }: any) => (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => onEditar(row)} title="Editar" aria-label={`Editar ruta ${row.codigoRuta ?? row.nombre}`}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                <Pencil size={15} />
              </button>
              <button type="button" onClick={() => onEliminar(row)} title="Eliminar" aria-label={`Eliminar ruta ${row.codigoRuta ?? row.nombre}`}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                <Trash2 size={15} />
              </button>
            </div>
          ),
        },
      ]}
      paginationProps={meta.totalPages > 1 ? {
        currentPage: meta.page,
        totalPages: meta.totalPages,
        onPageChange: setPage,
        showingText: <PieTabla total={meta.total} pagina={meta.page} cantidad={data.length} tamano={pageSize} onTamanoChange={(t) => { setPageSize(t); setPage(1); }} etiqueta="rutas" />,
      } : undefined}
    />
  );
}

export const RutasPage = () => {
  const [search, setSearch] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [idSucursal, setIdSucursal] = useState('');
  const sucursales = useSucursales(false);
  const [grupos, setGrupos] = useState<RutasPorEmpleado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [version, setVersion] = useState(0);

  const [modalState, setModalState] = useState<{ mode: 'create' | 'edit'; ruta?: Ruta } | null>(null);
  const [rutaAEliminar, setRutaAEliminar] = useState<Ruta | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // La búsqueda se aplica con un pequeño retraso para no consultar en cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => setBusqueda(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setCargando(true);
    setError(null);
    apiClient.get<RutasPorEmpleado[]>(`/cxc/rutas-por-empleado${buildQueryString({ search: busqueda, idSucursal: idSucursal || undefined })}`, { signal: controller.signal })
      .then((res) => {
        setGrupos(res);
        // Con búsqueda activa se despliegan los resultados; sin ella, si hay un solo empleado, también.
        if (busqueda || idSucursal || res.length === 1) setAbiertos(new Set(res.map((g) => g.idEmpleado)));
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las rutas'); })
      .finally(() => { if (!controller.signal.aborted) setCargando(false); });
    return () => controller.abort();
  }, [busqueda, idSucursal, version]);

  const recargar = () => setVersion((v) => v + 1);
  const alternar = (id: number) => setAbiertos((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const todosAbiertos = grupos.length > 0 && grupos.every((g) => abiertos.has(g.idEmpleado));
  const totalRutas = grupos.reduce((acc, g) => acc + g.totalRutas, 0);

  const handleDelete = async () => {
    if (!rutaAEliminar) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.delete(`/cxc/rutas/${rutaAEliminar.idRuta}`);
      setRutaAEliminar(null);
      recargar();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se pudo eliminar la ruta');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-slate-900 text-sm font-bold">Rutas de Cobro</h1>
          <p className="text-sm text-slate-500">
            Rutas agrupadas por empleado. Despliega un empleado para ver sus rutas y haz clic en una ruta para ver sus paradas.
          </p>
        </div>
        <Button icon={Plus} onClick={() => setModalState({ mode: 'create' })}>
          Nueva Ruta
        </Button>
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TextInput
          icon={RouteIcon} maxLength={100}
          placeholder="Buscar por empleado, código, nombre de ruta o estado..."
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          className="sm:max-w-md"
          helperText=""
        />
        <Select
          label="Sucursal"
          value={idSucursal}
          onChange={(e: any) => setIdSucursal(e.target.value)}
          options={[{ value: '', label: 'Todas las sucursales' }, ...sucursales.map((s) => ({ value: s.id, label: s.nombre }))]}
          helperText=""
          className="sm:w-64"
        />
        {grupos.length > 1 && (
          <button
            type="button"
            onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(grupos.map((g) => g.idEmpleado)))}
            className="inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:self-auto"
          >
            {todosAbiertos ? <ChevronsDownUp size={16} aria-hidden="true" /> : <ChevronsUpDown size={16} aria-hidden="true" />}
            {todosAbiertos ? 'Contraer todo' : 'Expandir todo'}
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      {cargando && grupos.length === 0 ? (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando rutas">
          {[0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-xl border border-slate-200 bg-white" />)}
        </div>
      ) : grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {busqueda || idSucursal ? 'Ninguna ruta coincide con los filtros.' : 'No hay rutas registradas. Usa «Nueva Ruta» para crear la primera.'}
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <p className="text-xs text-slate-500">
            {plural(grupos.length, 'empleado', 'empleados')} · {plural(totalRutas, 'ruta', 'rutas')}
          </p>
          {grupos.map((g) => {
            const abierto = abiertos.has(g.idEmpleado);
            const panelId = `rutas-empleado-${g.idEmpleado}`;
            return (
              <section key={g.idEmpleado} className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-colors ${abierto ? 'border-blue-200' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => alternar(g.idEmpleado)}
                  aria-expanded={abierto}
                  aria-controls={panelId}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                >
                  <AvatarEmpleado key={g.fotoUrl ?? 'sin-foto'} nombre={g.nombreEmpleado} fotoUrl={g.fotoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="rutas-emp-nombre block truncate text-slate-900">{g.nombreEmpleado ?? `Empleado #${g.idEmpleado}`}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{plural(g.totalRutas, 'ruta', 'rutas')}</span>
                      <ResumenEstados g={g} />
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-right text-xs text-slate-500 sm:block">
                    {g.proximaFecha ? (
                      <>Próxima ruta<span className="block font-medium text-slate-800">{formatDateGT(g.proximaFecha)}</span></>
                    ) : g.ultimaFecha ? (
                      <>Última ruta<span className="block font-medium text-slate-800">{formatDateGT(g.ultimaFecha)}</span></>
                    ) : null}
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {abierto && (
                  <div id={panelId} className="border-t border-slate-100 bg-slate-50/50 p-3">
                    <RutasDelEmpleado
                      idEmpleado={g.idEmpleado}
                      idSucursal={idSucursal ? Number(idSucursal) : undefined}
                      search={busqueda}
                      version={version}
                      onEditar={(ruta) => setModalState({ mode: 'edit', ruta })}
                      onEliminar={setRutaAEliminar}
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!modalState}
        onClose={() => setModalState(null)}
        title={modalState?.mode === 'edit' ? 'Editar Ruta' : 'Nueva Ruta'}
      >
        <RutaForm
          ruta={modalState?.ruta}
          onCancel={() => setModalState(null)}
          onSuccess={() => { setModalState(null); recargar(); }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!rutaAEliminar}
        onClose={() => { setRutaAEliminar(null); setDeleteError(null); }}
        onConfirm={handleDelete}
        title="Eliminar ruta"
        description={`¿Eliminar la ruta "${rutaAEliminar?.nombre}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isLoading={isDeleting}
      />
      {deleteError && (
        <p className="text-sm text-red-600 font-medium">{deleteError}</p>
      )}
    </div>
  );
};
