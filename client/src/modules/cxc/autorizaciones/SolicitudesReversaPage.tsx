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
import { ROL_LABEL, TIPO_SOLICITUD_LABEL, type NotaCredito, type SolicitudReversa } from '@erp/contracts';

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
  const [notaAprobar, setNotaAprobar] = useState<NotaCredito | null>(null);
  const [notaRechazar, setNotaRechazar] = useState<NotaCredito | null>(null);
  const [procesandoNota, setProcesandoNota] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN';

  const { data, meta, isLoading, error, refetch } = usePaginatedList<SolicitudReversa>(
    '/cxc/solicitudes-reversa',
    { page, limit: pageSize, search, estado: estado || undefined },
  );
  const notasPendientes = usePaginatedList<NotaCredito>('/cxc/notas-credito', {
    page, limit: Math.max(1, Math.floor(pageSize / 2)), search, pendientesAprobacion: 1,
  });
  const filas = [
    ...data.map((item) => ({ tipoFila: 'solicitud' as const, item })),
    ...(esAdmin && (estado === 'PENDIENTE' || estado === '')
      ? notasPendientes.data.map((item) => ({ tipoFila: 'nota' as const, item }))
      : []),
  ];
  const totalNotasVisibles = esAdmin && (estado === 'PENDIENTE' || estado === '') ? notasPendientes.meta.total : 0;

  const aprobarNota = async () => {
    if (!notaAprobar) return;
    setProcesandoNota(true);
    try {
      await apiClient.post(`/cxc/notas-credito/${notaAprobar.idNotaCredito}/aprobar`, {}, { successMessage: false });
      toast.success('Nota de crédito aprobada y aplicada a su factura.');
      window.dispatchEvent(new Event('cxc-autorizaciones-actualizadas'));
      setNotaAprobar(null);
      notasPendientes.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar la nota de crédito');
    } finally {
      setProcesandoNota(false);
    }
  };

  const accion = async (s: SolicitudReversa, ruta: 'aprobar' | 'cancelar', exito: string) => {
    setProcesando(true);
    setActionError(null);
    try {
      await apiClient.post(`/cxc/solicitudes-reversa/${s.idSolicitud}/${ruta}`, {});
      toast.success(exito);
      window.dispatchEvent(new Event('cxc-autorizaciones-actualizadas'));
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
        <p className="text-sm text-slate-500">Aprobaciones de notas de crédito, reversas y anulaciones pendientes.</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        Las notas de crédito deben aprobarse antes de afectar la factura. Un <strong>administrador</strong> también aprueba o rechaza las solicitudes de reversa y anulación; la solicitud debe resolverla alguien distinto de quien la registró.
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
      {notasPendientes.error && <p className="text-sm text-red-600">{notasPendientes.error}</p>}

      <DataTable
        isLoading={isLoading || (esAdmin && notasPendientes.isLoading)}
        data={filas}
        emptyText={estado === 'PENDIENTE' ? 'No hay solicitudes pendientes' : 'No hay solicitudes'}
        columns={[
          { header: 'ID', cell: ({ row }: any) => row.tipoFila === 'nota' ? `NC-${row.item.idNotaCredito}` : row.item.idSolicitud },
          {
            header: 'Operación',
            cell: ({ row }: any) => row.tipoFila === 'nota' ? (
              <span className="text-sm">
                <span className="block font-medium text-slate-800">Aprobación de nota de crédito</span>
                <span className="block text-xs text-slate-500">{row.item.serie ?? 'NC'}-{row.item.numero ?? row.item.idNotaCredito} · {row.item.nombreCliente || `Cliente #${row.item.idCliente}`}</span>
              </span>
            ) : (
              <span className="text-sm">
                <span className="block font-medium text-slate-800">{TIPO_SOLICITUD_LABEL[row.item.tipo]}</span>
                <span className="block text-xs text-slate-500">{row.item.referencia || `#${row.item.idRegistro}`}</span>
              </span>
            ),
          },
          { header: 'Monto', cell: ({ row }: any) => money(row.tipoFila === 'nota' ? row.item.montoDisponible : row.item.monto) },
          { header: 'Motivo', cell: ({ row }: any) => row.tipoFila === 'nota'
            ? <span className="block max-w-xs text-sm">Aplicar a la factura de referencia</span>
            : <span className="block max-w-xs text-sm" title={row.item.motivo}>{row.item.motivo}</span> },
          {
            header: 'Solicitó',
            cell: ({ row }: any) => row.tipoFila === 'nota' ? (
              <span className="text-xs leading-5 text-slate-600">
                <span className="block font-medium text-slate-800">{row.item.nombreEmpleadoRegistro || '—'}</span>
                <span className="block">{formatDateGT(row.item.fechaRegistro || row.item.fecha)}</span>
              </span>
            ) : (
              <span className="text-xs leading-5 text-slate-600">
                <span className="block font-medium text-slate-800">{row.item.solicitante || '—'}</span>
                <span className="block">{row.item.rolSolicitante ? (ROL_LABEL as Record<string, string>)[row.item.rolSolicitante] ?? row.item.rolSolicitante : ''} · {formatDateGT(row.item.fechaSolicitud)}</span>
              </span>
            ),
          },
          {
            header: 'Estado',
            cell: ({ row }: any) => row.tipoFila === 'nota' ? (
              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">Por aprobar</span>
            ) : (
              <span className="text-xs leading-5">
                <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 font-medium ${ESTADO[row.item.estado].clase}`}>{ESTADO[row.item.estado].label}</span>
                {row.item.resolvio && row.item.estado !== 'CANCELADA' && <span className="block text-slate-500 mt-1">por {row.item.resolvio} · {formatDateGT(row.item.fechaResolucion)}</span>}
                {row.item.motivoRechazo && <span className="block text-red-700 mt-1" title={row.item.motivoRechazo}>{row.item.motivoRechazo}</span>}
              </span>
            ),
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) => {
              if (row.tipoFila === 'nota') return <div className="flex justify-end gap-1">
                <button onClick={() => setNotaAprobar(row.item)} className="p-1.5 rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-700" title="Aprobar nota y aplicar a la factura"><CheckCircle2 size={15} /></button>
                <button onClick={() => setNotaRechazar(row.item)} className="p-1.5 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600" title="Rechazar nota"><XCircle size={15} /></button>
              </div>;
              if (row.item.estado !== 'PENDIENTE') return null;
              const propia = row.item.idUsuarioSolicita === usuario?.idUsuario;
              return (
                <div className="flex justify-end gap-1">
                  {esAdmin && !propia && (
                    <>
                      <button onClick={() => setAAprobar(row.item)} className="p-1.5 rounded-md text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700" title="Aprobar y ejecutar">
                        <CheckCircle2 size={15} />
                      </button>
                      <button onClick={() => setARechazar(row.item)} className="p-1.5 rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Rechazar">
                        <XCircle size={15} />
                      </button>
                    </>
                  )}
                  {esAdmin && propia && <span className="text-xs text-slate-500" title="Tu propia solicitud debe aprobarla otro administrador">Espera a otro administrador</span>}
                  {propia && (
                    <button onClick={() => setACancelar(row.item)} className="p-1.5 rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Cancelar mi solicitud">
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
          totalPages: Math.max(meta.totalPages, notasPendientes.meta.totalPages),
          onPageChange: setPage,
          showingText: <PieTabla total={meta.total + totalNotasVisibles} pagina={meta.page} cantidad={filas.length} tamano={pageSize} onTamanoChange={(t) => { setPageSize(t); setPage(1); }} etiqueta="solicitudes" />,
        }}
      />

      <ConfirmDialog
        isOpen={!!notaAprobar}
        onClose={() => setNotaAprobar(null)}
        onConfirm={aprobarNota}
        title={notaAprobar ? `Aprobar nota ${notaAprobar.serie ?? 'NC'}-${notaAprobar.numero ?? notaAprobar.idNotaCredito}` : 'Aprobar nota'}
        description={notaAprobar ? `Se aplicarán ${money(notaAprobar.montoDisponible)} a la factura de referencia de ${notaAprobar.nombreCliente || `Cliente #${notaAprobar.idCliente}`}. Esta acción reducirá su saldo.` : ''}
        confirmLabel="Aprobar y aplicar"
        variant="primary"
        isLoading={procesandoNota}
      />
      {notaRechazar && <TrazabilidadActionModal
        title={`Rechazar nota ${notaRechazar.serie ?? 'NC'}-${notaRechazar.numero ?? notaRechazar.idNotaCredito}`}
        description="La nota quedará anulada y no modificará el saldo de la factura."
        endpoint={`/cxc/notas-credito/${notaRechazar.idNotaCredito}/rechazar`}
        actionLabel="Rechazar"
        motivoLabel="Motivo del rechazo"
        motivoFieldName="motivoRechazo"
        onClose={() => setNotaRechazar(null)}
        onSuccess={() => { setNotaRechazar(null); notasPendientes.refetch(); }}
      />}

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
