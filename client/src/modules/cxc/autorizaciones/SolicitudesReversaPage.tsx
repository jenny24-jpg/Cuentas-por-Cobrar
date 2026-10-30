import { useState } from 'react';
import { CheckCircle2, Search, Undo2, XCircle } from 'lucide-react';
import { DataTable, Select, TextInput } from '../../../shared/ui-kit';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { TrazabilidadActionModal } from '../../../shared/components';
import { toast } from '../../../shared/components/Toast';
import { usePaginatedList } from '../../../shared/hooks';
import { apiClient, ApiError } from '../../../shared/api';
import { formatDateGT } from '../../../shared/date';
import { useAuth } from '../../../shared/auth/AuthContext';
import { PieTabla, useTamanoPagina } from '../../../shared/components/PieTabla';
import { ROL_LABEL, TIPO_SOLICITUD_LABEL, type SolicitudReversa } from '@erp/contracts';

const money = (value: unknown) => `Q ${Number(value ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADO: Record<SolicitudReversa['estado'], { label: string; clase: string }> = {
  PENDIENTE: { label: 'Pendiente', clase: 'border-amber-200 bg-amber-50 text-amber-800' },
  APROBADA: { label: 'Aprobada', clase: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  RECHAZADA: { label: 'Rechazada', clase: 'border-red-200 bg-red-50 text-red-700' },
  CANCELADA: { label: 'Cancelada', clase: 'border-slate-200 bg-slate-50 text-slate-600' },
};

/**
 * Reversas y anulaciones que esperan autorización. Un ADMIN aprueba (se ejecuta)
 * o rechaza las solicitudes de otros usuarios; quien solicitó puede cancelar la suya
 * mientras siga pendiente.
 */
export const SolicitudesReversaPage = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanoPagina('cxc.autorizaciones.SolicitudesReversaPage');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('PENDIENTE');
  const [aAprobar, setAAprobar] = useState<SolicitudReversa | null>(null);
  const [aRechazar, setARechazar] = useState<SolicitudReversa | null>(null);
  const [aCancelar, setACancelar] = useState<SolicitudReversa | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN';

  const { data, meta, isLoading, error, refetch } = usePaginatedList<SolicitudReversa>(
    '/cxc/solicitudes-reversa',
    { page, limit: pageSize, search, estado: estado || undefined },
  );

  const accion = async (s: SolicitudReversa, ruta: 'aprobar' | 'cancelar', exito: string) => {
    setProcesando(true);
    setActionError(null);
    try {
      await apiClient.post(`/cxc/solicitudes-reversa/${s.idSolicitud}/${ruta}`, {});
      toast.success(exito);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo completar la acción');
    } finally {
      setProcesando(false);
      setAAprobar(null);
      setACancelar(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 text-sm font-bold">Autorizaciones</h1>
        <p className="text-sm text-slate-500">Reversas y anulaciones solicitadas. Ninguna cambia saldos hasta que un administrador la aprueba.</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        Un <strong>operador</strong> solicita y un <strong>administrador</strong> aprueba o rechaza. Si solicita un administrador, debe aprobarla <strong>otro</strong> administrador. Al aprobarse se ejecuta la reversa o anulación; la corrección (aplicar al cliente o monto correcto) se hace después.
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <TextInput
          icon={Search} maxLength={100}
          placeholder="Buscar referencia, motivo o solicitante..."
          value={search}
          onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-md flex-1"
        />
        <Select
          label=""
          value={estado}
          onChange={(e: any) => { setEstado(e.target.value); setPage(1); }}
          options={[
            { value: 'PENDIENTE', label: 'Pendientes' },
            { value: 'APROBADA', label: 'Aprobadas' },
            { value: 'RECHAZADA', label: 'Rechazadas' },
            { value: 'CANCELADA', label: 'Canceladas' },
            { value: '', label: 'Todas' },
          ]}
        />
      </div>

      {(error || actionError) && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error || actionError}</p>
      )}

      <DataTable
        isLoading={isLoading}
        data={data}
        emptyText={estado === 'PENDIENTE' ? 'No hay solicitudes pendientes' : 'No hay solicitudes'}
        columns={[
          { header: 'ID', accessorKey: 'idSolicitud' },
          {
            header: 'Operación',
            cell: ({ row }: { row: SolicitudReversa }) => (
              <span className="text-sm">
                <span className="block font-medium text-slate-800">{TIPO_SOLICITUD_LABEL[row.tipo]}</span>
                <span className="block text-xs text-slate-500">{row.referencia || `#${row.idRegistro}`}</span>
              </span>
            ),
          },
          { header: 'Monto', accessorKey: 'monto', cell: ({ value }: any) => (value == null ? '—' : money(value)) },
          { header: 'Motivo', accessorKey: 'motivo', cell: ({ value }: any) => <span className="block max-w-xs text-sm" title={value}>{value}</span> },
          {
            header: 'Solicitó',
            cell: ({ row }: { row: SolicitudReversa }) => (
              <span className="text-xs leading-5 text-slate-600">
                <span className="block font-medium text-slate-800">{row.solicitante || '—'}</span>
                <span className="block">{row.rolSolicitante ? (ROL_LABEL as Record<string, string>)[row.rolSolicitante] ?? row.rolSolicitante : ''} · {formatDateGT(row.fechaSolicitud)}</span>
              </span>
            ),
          },
          {
            header: 'Estado',
            cell: ({ row }: { row: SolicitudReversa }) => (
              <span className="text-xs leading-5">
                <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 font-medium ${ESTADO[row.estado].clase}`}>{ESTADO[row.estado].label}</span>
                {row.resolvio && row.estado !== 'CANCELADA' && <span className="block text-slate-500 mt-1">por {row.resolvio} · {formatDateGT(row.fechaResolucion)}</span>}
                {row.motivoRechazo && <span className="block text-red-700 mt-1" title={row.motivoRechazo}>{row.motivoRechazo}</span>}
              </span>
            ),
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: { row: SolicitudReversa }) => {
              if (row.estado !== 'PENDIENTE') return null;
              const propia = row.idUsuarioSolicita === usuario?.idUsuario;
              return (
                <div className="flex justify-end gap-1">
                  {esAdmin && !propia && (
                    <>
                      <button onClick={() => setAAprobar(row)} className="p-1.5 rounded-md text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700" title="Aprobar y ejecutar">
                        <CheckCircle2 size={15} />
                      </button>
                      <button onClick={() => setARechazar(row)} className="p-1.5 rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Rechazar">
                        <XCircle size={15} />
                      </button>
                    </>
                  )}
                  {esAdmin && propia && <span className="text-xs text-slate-500" title="Tu propia solicitud debe aprobarla otro administrador">Espera a otro administrador</span>}
                  {propia && (
                    <button onClick={() => setACancelar(row)} className="p-1.5 rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Cancelar mi solicitud">
                      <Undo2 size={15} />
                    </button>
                  )}
                </div>
              );
            },
          },
        ]}
        paginationProps={{
          currentPage: meta.page,
          totalPages: meta.totalPages,
          onPageChange: setPage,
          showingText: <PieTabla total={meta.total} pagina={meta.page} cantidad={data.length} tamano={pageSize} onTamanoChange={(t) => { setPageSize(t); setPage(1); }} etiqueta="solicitudes" />,
        }}
      />

      <ConfirmDialog
        isOpen={!!aAprobar}
        onClose={() => setAAprobar(null)}
        onConfirm={() => aAprobar && accion(aAprobar, 'aprobar', 'Solicitud aprobada: la operación se ejecutó.')}
        title={aAprobar ? `Aprobar: ${TIPO_SOLICITUD_LABEL[aAprobar.tipo]}` : ''}
        description={aAprobar ? `${aAprobar.referencia ?? ''}${aAprobar.monto != null ? ` · ${money(aAprobar.monto)}` : ''}. Se ejecutará ahora y quedarás registrado como quien la aprobó. ¿Continuar?` : ''}
        confirmLabel="Aprobar"
        variant="primary"
        isLoading={procesando}
      />

      <ConfirmDialog
        isOpen={!!aCancelar}
        onClose={() => setACancelar(null)}
        onConfirm={() => aCancelar && accion(aCancelar, 'cancelar', 'Solicitud cancelada.')}
        title="Cancelar mi solicitud"
        description="La solicitud se retira y no se ejecutará. ¿Continuar?"
        confirmLabel="Cancelar solicitud"
        isLoading={procesando}
      />

      {aRechazar && (
        <TrazabilidadActionModal
          title={`Rechazar: ${TIPO_SOLICITUD_LABEL[aRechazar.tipo]}`}
          description={`${aRechazar.referencia ?? ''}. No se ejecutará y no cambiará ningún saldo.`}
          endpoint={`/cxc/solicitudes-reversa/${aRechazar.idSolicitud}/rechazar`}
          actionLabel="Rechazar"
          motivoLabel="Motivo del rechazo"
          motivoFieldName="motivoRechazo"
          onClose={() => setARechazar(null)}
          onSuccess={() => { setARechazar(null); refetch(); }}
        />
      )}
    </div>
  );
};
