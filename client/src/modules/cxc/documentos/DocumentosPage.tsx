import { useState } from 'react';
import { Plus, Pencil, Trash2, Search, Eye, Ban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DataTable, StatusBadge, Button, TextInput } from '../../../shared/ui-kit';
import { Modal, TrazabilidadActionModal } from '../../../shared/components';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { usePaginatedList, useSolicitudesPendientes } from '../../../shared/hooks';
import { apiClient, ApiError } from '../../../shared/api';
import { formatDateGT } from '../../../shared/date';
import type { Documento } from '@erp/contracts';
import { DocumentoForm } from './components/DocumentoForm';
import { PieTabla, useTamanoPagina } from '../../../shared/components/PieTabla';


export const DocumentosPage = () => {
  const pend = useSolicitudesPendientes('ANULACION_DOCUMENTO');
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanoPagina('cxc.documentos.DocumentosPage');
  const [search, setSearch] = useState('');
  const [modalState, setModalState] = useState<{ mode: 'create' | 'edit'; documento?: Documento } | null>(null);
  const [documentoAEliminar, setDocumentoAEliminar] = useState<Documento | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [aAnular, setAAnular] = useState<Documento | null>(null);

  const { data, meta, isLoading, error, refetch } = usePaginatedList<Documento>(
    '/cxc/documentos',
    { page, limit: pageSize, search },
  );

  const handleDelete = async () => {
    if (!documentoAEliminar) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/cxc/documentos/${documentoAEliminar.idDocumento}`);
      setDocumentoAEliminar(null);
      refetch();
    } catch (err) {
      console.error(err instanceof ApiError ? err.message : err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-slate-900 text-sm font-bold">Documentos CxC</h1>
          <p className="text-sm text-slate-500">Cabecera de documentos que generan o afectan la deuda del cliente.</p>
        </div>
        <Button icon={Plus} onClick={() => setModalState({ mode: 'create' })}>
          Nuevo Documento
        </Button>
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <TextInput
          icon={Search} maxLength={100}
          placeholder="Buscar cliente, NIT, serie, número o estado..."
          value={search}
          onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-md"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      <DataTable
        isLoading={isLoading}
        data={data}
        emptyText="No hay documentos registrados"
        columns={[
          { header: 'ID Cliente', accessorKey: 'idCliente', cell: ({ value }: any) => <span className="tabular-nums text-slate-500">#{value}</span> },
          { header: 'Cliente', accessorKey: 'nombreCliente' },
          {
            header: 'Documento',
            cell: ({ row }: any) => [row.serie, row.numeroDocumento].filter(Boolean).join('-'),
          },
          { header: 'Tipo', accessorKey: 'nombreTipoDocumento' },
          { header: 'Vencimiento', accessorKey: 'fechaVencimiento', cell: ({ value }: any) => formatDateGT(value) },
          { header: 'Saldo inicial', accessorKey: 'total', cell: ({ value }: any) => `Q ${Number(value).toFixed(2)}` },
          { header: 'Pago recibido', accessorKey: 'montoPagado', cell: ({ value }: any) => `Q ${Number(value ?? 0).toFixed(2)}` },
          { header: 'Saldo actual', accessorKey: 'saldo', cell: ({ value }: any) => `Q ${Number(value).toFixed(2)}` },
          {
            header: 'Estado',
            cell: ({ row }: any) => <StatusBadge status={row.estado} />,
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) => {
              const pendiente = pend.pendientes.has(row.idDocumento);
              const anulable = (!['ANULADO', 'ANULADA', 'PAGADO', 'PAGADA'].includes(String(row.estado).toUpperCase())) && !pendiente;
              return (
                <div className="flex justify-end gap-1">
                  {pendiente && <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800" title="Espera la aprobación de un administrador">Anulación solicitada</span>}
                  <button
                    onClick={() => navigate(`/cxc/documentos/documentos/${row.idDocumento}`)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                    title="Ver detalle"
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    onClick={() => setModalState({ mode: 'edit', documento: row })}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Editar"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => !anulable ? undefined : setAAnular(row)}
                    disabled={!anulable}
                    className={`p-1.5 rounded-md transition-colors ${anulable ? 'text-slate-400 hover:text-amber-700 hover:bg-amber-50' : 'text-slate-300 cursor-not-allowed'}`}
                    title={pendiente ? 'Anulación solicitada: espera la aprobación de un administrador' : anulable ? 'Anular documento' : 'No se puede anular un documento pagado o ya anulado'}
                  >
                    <Ban size={15} />
                  </button>
                  <button
                    onClick={() => setDocumentoAEliminar(row)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={15} />
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
        title={modalState?.mode === 'edit' ? 'Editar Documento' : 'Nuevo Documento'}
      >
        <DocumentoForm
          documento={modalState?.documento}
          onCancel={() => setModalState(null)}
          onSuccess={() => { setModalState(null); refetch(); }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!documentoAEliminar}
        onClose={() => setDocumentoAEliminar(null)}
        onConfirm={handleDelete}
        title="Eliminar documento"
        description={`¿Eliminar el documento ${documentoAEliminar?.serie ?? ''}-${documentoAEliminar?.numeroDocumento ?? ''}? Solo se permitirá si no tiene movimientos financieros.`}
        confirmLabel="Eliminar"
        isLoading={isDeleting}
      />

      {aAnular && (
        <TrazabilidadActionModal
          title={`Solicitar anulación de documento ${[aAnular.serie, aAnular.numeroDocumento].filter(Boolean).join('-')}`}
          description="Al aprobarse, el saldo pendiente del documento se llevará a cero. No se revierten los pagos/notas/anticipos ya aplicados a él."
          endpoint={`/cxc/documentos/${aAnular.idDocumento}/anular`}
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
