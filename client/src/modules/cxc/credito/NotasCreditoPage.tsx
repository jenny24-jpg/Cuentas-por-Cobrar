import { useState } from 'react';
import { Plus, Pencil, Search, Ban, CheckCircle2, XCircle } from 'lucide-react';
import { DataTable, StatusBadge, Button, TextInput } from '../../../shared/ui-kit';
import { Modal, TrazabilidadActionModal } from '../../../shared/components';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { usePaginatedList, useSolicitudesPendientes } from '../../../shared/hooks';
import { apiClient, ApiError } from '../../../shared/api';
import { formatDateGT } from '../../../shared/date';
import type { NotaCredito } from '@erp/contracts';
import { NotaCreditoForm } from './components/NotaCreditoForm';
import { useAuth } from '../../../shared/auth/AuthContext';
import { PieTabla, useTamanoPagina } from '../../../shared/components/PieTabla';


/** Pendiente y sin aprobador: todavía no rebaja ningún saldo. */
const porAprobar = (nota: NotaCredito) =>
  ['PENDIENTE', 'ACTIVA'].includes(String(nota.estado).toUpperCase()) && !nota.idEmpleadoAprobacion;

const money = (value: unknown) => `Q ${Number(value ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const NotasCreditoPage = () => {
  const pend = useSolicitudesPendientes('ANULACION_NOTA_CREDITO');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanoPagina('cxc.credito.NotasCreditoPage');
  const [search, setSearch] = useState('');
  const [modalState, setModalState] = useState<{ mode: 'create' | 'edit'; nota?: NotaCredito } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [aAnular, setAAnular] = useState<NotaCredito | null>(null);
  const [aAprobar, setAAprobar] = useState<NotaCredito | null>(null);
  const [aRechazar, setARechazar] = useState<NotaCredito | null>(null);
  const [isAprobando, setIsAprobando] = useState(false);
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN';

  const handleAprobar = async () => {
    if (!aAprobar) return;
    setIsAprobando(true);
    setActionError(null);
    try {
      await apiClient.post(`/cxc/notas-credito/${aAprobar.idNotaCredito}/aprobar`, {});
      setAAprobar(null);
      refetch();
    } catch (err) {
      setAAprobar(null);
      setActionError(err instanceof ApiError ? err.message : 'No se pudo aprobar la nota de crédito');
    } finally {
      setIsAprobando(false);
    }
  };

  const { data, meta, isLoading, error, refetch } = usePaginatedList<NotaCredito>(
    '/cxc/notas-credito',
    { page, limit: pageSize, search },
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-slate-900 text-sm font-bold">Notas de Crédito</h1>
          <p className="text-sm text-slate-500">Las notas se registran como saldo a favor y reducen la deuda únicamente al aplicarse.</p>
        </div>
        <Button icon={Plus} onClick={() => setModalState({ mode: 'create' })}>Nueva Nota</Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        Una nota de crédito nueva queda <strong>Por aprobar</strong> y no modifica el saldo. Un administrador distinto de quien la registró la aprueba: en ese momento se aplica a su factura y baja el saldo.
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <TextInput
          icon={Search} maxLength={100}
          placeholder="Buscar cliente, serie, número, estado..."
          value={search}
          onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-md"
        />
      </div>

      {(error || actionError) && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error || actionError}
        </p>
      )}

      <DataTable
        isLoading={isLoading}
        data={data}
        emptyText="No hay notas de crédito registradas"
        columns={[
          { header: 'ID', accessorKey: 'idNotaCredito' },
          { header: 'ID Cliente', accessorKey: 'idCliente', cell: ({ value }: any) => <span className="tabular-nums text-slate-500">#{value}</span> },
          { header: 'Cliente', cell: ({ row }: any) => row.nombreCliente || `Cliente #${row.idCliente}` },
          { header: 'Serie', accessorKey: 'serie', cell: ({ value }: any) => value || '—' },
          { header: 'Número', accessorKey: 'numero', cell: ({ value }: any) => value || '—' },
          { header: 'Fecha', accessorKey: 'fecha', cell: ({ value }: any) => formatDateGT(value) },
          { header: 'Monto', accessorKey: 'monto', cell: ({ value }: any) => money(value) },
          { header: 'Aplicado', accessorKey: 'montoAplicado', cell: ({ value }: any) => money(value) },
          { header: 'Disponible', accessorKey: 'montoDisponible', cell: ({ value }: any) => money(value) },
          {
            header: 'Estado',
            cell: ({ row }: any) => porAprobar(row)
              ? <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">Por aprobar</span>
              : <StatusBadge status={row.estado} />,
          },
          {
            header: 'Aprobación',
            cell: ({ row }: any) => (
              <span className="text-xs leading-5 text-slate-600">
                <span className="block">Registró: {row.nombreEmpleadoRegistro || '—'}</span>
                <span className="block">Aprobó: {row.nombreEmpleadoAprobacion || (porAprobar(row) ? 'pendiente' : '—')}</span>
              </span>
            ),
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) => {
              const locked = Number(row.montoAplicado ?? 0) > 0.005 || ['APLICADA', 'ANULADA'].includes(String(row.estado).toUpperCase());
              const pendiente = pend.pendientes.has(row.idNotaCredito);
              const anulable = (Number(row.montoAplicado ?? 0) <= 0.005 && String(row.estado).toUpperCase() !== 'ANULADA') && !pendiente;
              return (
                <div className="flex justify-end gap-1">
                  {pendiente && <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800" title="Espera la aprobación de un administrador">Anulación solicitada</span>}
                  {esAdmin && porAprobar(row) && (
                    <>
                      <button
                        onClick={() => setAAprobar(row)}
                        className="p-1.5 rounded-md text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                        title="Aprobar y aplicar a su documento (debe hacerlo un administrador distinto de quien la registró)"
                      >
                        <CheckCircle2 size={15} />
                      </button>
                      <button
                        onClick={() => setARechazar(row)}
                        className="p-1.5 rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Rechazar nota"
                      >
                        <XCircle size={15} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setModalState({ mode: 'edit', nota: row })}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title={locked ? 'Ver nota bloqueada por aplicaciones' : 'Editar nota'}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => anulable && setAAnular(row)}
                    disabled={!anulable}
                    className={`p-1.5 rounded-md transition-colors ${anulable ? 'text-slate-400 hover:text-amber-700 hover:bg-amber-50' : 'text-slate-300 cursor-not-allowed'}`}
                    title={pendiente ? 'Anulación solicitada: espera la aprobación de un administrador' : anulable ? 'Anular nota' : 'Una nota con aplicaciones o ya anulada no se puede anular de nuevo'}
                  >
                    <Ban size={15} />
                  </button>
                </div>
              );
            },
          },
        ]}
        paginationProps={{
          currentPage: meta.page,
          totalPages: meta.totalPages,
          onPageChange: setPage,
          showingText: <PieTabla total={meta.total} pagina={meta.page} cantidad={data.length} tamano={pageSize} onTamanoChange={(t) => { setPageSize(t); setPage(1); }} etiqueta="registros" />,
        }}
      />

      <Modal
        isOpen={!!modalState}
        onClose={() => setModalState(null)}
        title={modalState?.mode === 'edit' ? 'Editar Nota de Crédito' : 'Nueva Nota de Crédito'}
      >
        <NotaCreditoForm
          nota={modalState?.nota}
          onCancel={() => setModalState(null)}
          onSuccess={() => { setModalState(null); refetch(); }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!aAprobar}
        onClose={() => setAAprobar(null)}
        onConfirm={handleAprobar}
        title={`Aprobar nota de crédito ${aAprobar ? `${aAprobar.serie ?? ''}-${aAprobar.numero ?? ''}` : ''}`}
        description={`Se aplicará ${money(aAprobar?.montoDisponible)} a su documento de referencia y bajará su saldo. Quedarás registrado como quien aprobó. ¿Continuar?`}
        confirmLabel="Aprobar"
        variant="primary"
        isLoading={isAprobando}
      />

      {aRechazar && (
        <TrazabilidadActionModal
          title={`Rechazar nota de crédito ${aRechazar.serie ?? ''}-${aRechazar.numero ?? ''}`}
          description="La nota quedará anulada con el motivo indicado y no modificará el saldo de la factura."
          endpoint={`/cxc/notas-credito/${aRechazar.idNotaCredito}/rechazar`}
          actionLabel="Rechazar"
          motivoLabel="Motivo del rechazo"
          motivoFieldName="motivoRechazo"
          onClose={() => setARechazar(null)}
          onSuccess={() => { setARechazar(null); refetch(); }}
        />
      )}

      {aAnular && (
        <TrazabilidadActionModal
          title={`Solicitar anulación de nota de crédito #${aAnular.idNotaCredito}`}
          description="Al aprobarse, la nota quedará marcada como anulada de forma permanente. Solo se puede anular una nota sin aplicaciones vigentes."
          endpoint={`/cxc/notas-credito/${aAnular.idNotaCredito}/anular`}
          actionLabel="Solicitar anulación"
          requiereAutorizacion
          motivoLabel="Motivo de la anulación"
          motivoFieldName="motivoAnulacion"
          onClose={() => setAAnular(null)}
          onSuccess={() => { setAAnular(null); refetch(); pend.recargar(); }}
        />
      )}
    </div>
  );
};
