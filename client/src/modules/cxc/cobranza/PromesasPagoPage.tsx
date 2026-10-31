import { useState } from 'react';
import { Plus, Pencil, Trash2, Search, AlertTriangle } from 'lucide-react';
import { DataTable, StatusBadge, Button, TextInput } from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { usePaginatedList } from '../../../shared/hooks';
import { apiClient, ApiError } from '../../../shared/api';
import { formatDateGT } from '../../../shared/date';
import type { PromesaPago } from '@erp/contracts';
import { PromesaPagoForm } from './components/PromesaPagoForm';
import { PieTabla, useTamanoPagina } from '../../../shared/components/PieTabla';


export const PromesasPagoPage = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanoPagina('cxc.cobranza.PromesasPagoPage');
  const [search, setSearch] = useState('');
  const [modalState, setModalState] = useState<{ mode: 'create' | 'edit'; promesa?: PromesaPago } | null>(null);
  const [promesaAEliminar, setPromesaAEliminar] = useState<PromesaPago | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, meta, isLoading, error, refetch } = usePaginatedList<PromesaPago>(
    '/cxc/promesas-pago',
    { page, limit: pageSize, search },
  );

  const handleDelete = async () => {
    if (!promesaAEliminar) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/cxc/promesas-pago/${promesaAEliminar.idPromesa}`);
      setPromesaAEliminar(null);
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
          <h1 className="text-slate-900 text-sm font-bold">Promesas de Pago</h1>
          <p className="text-sm text-slate-500">Seguimiento del monto y la fecha en que cada cliente acordó pagar.</p>
        </div>
        <Button icon={Plus} onClick={() => setModalState({ mode: 'create' })}>
          Nueva Promesa
        </Button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Fecha registrada</strong> indica cuándo se anotó el acuerdo. <strong>Fecha de pago acordada</strong> es el día en que el cliente se comprometió a pagar. Si la promesa nació de una gestión de cobro, aquí también verás el documento y la gestión relacionados.
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <TextInput
          icon={Search} maxLength={100}
          placeholder="Buscar por cliente o estado..."
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
        emptyText="No hay promesas de pago registradas"
        columns={[
          { header: 'ID promesa', accessorKey: 'idPromesa' },
          { header: 'Cliente', accessorKey: 'nombreCliente' },
          { header: 'Documento', cell: ({ row }: any) => row.idDocumento ? `Documento #${row.idDocumento}` : '—' },
          { header: 'Gestión relacionada', cell: ({ row }: any) => row.idGestion ? `Gestión #${row.idGestion}` : 'Registro directo' },
          { header: 'Fecha registrada', accessorKey: 'fechaPromesa', cell: ({ value }: any) => formatDateGT(value) },
          { header: 'Fecha de pago acordada', accessorKey: 'fechaCompromiso', cell: ({ value }: any) => formatDateGT(value) },
          { header: 'Monto acordado', accessorKey: 'montoComprometido', cell: ({ value }: any) => `Q ${Number(value).toFixed(2)}` },
          { header: 'Observaciones', accessorKey: 'observaciones', cell: ({ value }: any) => value ? <span className="block max-w-[240px] truncate" title={value}>{value}</span> : '—' },
          {
            header: 'Estado',
            cell: ({ row }: any) => (
              <div className="flex items-center gap-1.5">
                <StatusBadge status={row.estado} />
                {row.estaVencida && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600"
                    title="La fecha comprometida ya pasó sin marcarse cumplida o incumplida"
                  >
                    <AlertTriangle size={12} />
                    Vencida
                  </span>
                )}
              </div>
            ),
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => setModalState({ mode: 'edit', promesa: row })}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title="Editar"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setPromesaAEliminar(row)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ),
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
        title={modalState?.mode === 'edit' ? 'Editar Promesa de Pago' : 'Nueva Promesa de Pago'}
      >
        <PromesaPagoForm
          promesa={modalState?.promesa}
          onCancel={() => setModalState(null)}
          onSuccess={() => { setModalState(null); refetch(); }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!promesaAEliminar}
        onClose={() => setPromesaAEliminar(null)}
        onConfirm={handleDelete}
        title="Eliminar promesa de pago"
        description={`¿Eliminar la promesa de ${promesaAEliminar?.nombreCliente}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
};
