import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Search, Eye } from 'lucide-react';
import { DataTable, StatusBadge, Button, TextInput } from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { usePaginatedList } from '../../../shared/hooks';
import { apiClient, ApiError } from '../../../shared/api';
import type { ConvenioPago } from '@erp/contracts';
import { ConvenioPagoForm } from './components/ConvenioPagoForm';

const PAGE_SIZE = 10;

const ESTADO_TONE: Record<string, string> = {
  ACTIVO: 'revision',
  CUMPLIDO: 'aprobada',
  INCUMPLIDO: 'rechazada',
  CANCELADO: 'rechazada',
};

export const ConveniosPagoPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [convenioAEliminar, setConvenioAEliminar] = useState<ConvenioPago | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, meta, isLoading, error, refetch } = usePaginatedList<ConvenioPago>(
    '/cxc/convenios-pago',
    { page, limit: PAGE_SIZE, search },
  );

  const handleDelete = async () => {
    if (!convenioAEliminar) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/cxc/convenios-pago/${convenioAEliminar.idConvenio}`);
      setConvenioAEliminar(null);
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
          <h1 className="text-2xl font-bold text-slate-900">Convenios de Pago</h1>
          <p className="text-sm text-slate-500">Planes de pago a cuotas acordados con clientes en mora.</p>
        </div>
        <Button icon={Plus} onClick={() => setIsCreateOpen(true)}>
          Nuevo Convenio
        </Button>
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <TextInput
          icon={Search}
          placeholder="Buscar por cliente o estado..."
          value={search}
          onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      <DataTable
        isLoading={isLoading}
        data={data}
        emptyText="No hay convenios de pago registrados"
        onRowClick={(row: ConvenioPago) => navigate(`/cxc/cobranza/convenios-pago/${row.idConvenio}`)}
        columns={[
          { header: 'Cliente', accessorKey: 'nombreCliente' },
          { header: 'Fecha', accessorKey: 'fechaConvenio', cell: ({ value }: any) => value?.slice(0, 10) },
          { header: 'Monto deuda', accessorKey: 'montoDeuda', cell: ({ value }: any) => `Q ${Number(value).toFixed(2)}` },
          { header: 'Cuotas', accessorKey: 'numeroCuotas', align: 'center' },
          {
            header: 'Estado',
            cell: ({ row }: any) => <StatusBadge status={ESTADO_TONE[row.estado] ?? 'pendiente'} label={row.estado} />,
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); navigate(`/cxc/cobranza/convenios-pago/${row.idConvenio}`); }}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title="Ver cuotas"
                >
                  <Eye size={15} />
                </button>
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); setConvenioAEliminar(row); }}
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
          showingText: `Mostrando ${data.length} de ${meta.total} registros`,
        }}
      />

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Nuevo Convenio de Pago" size="lg">
        <ConvenioPagoForm
          onCancel={() => setIsCreateOpen(false)}
          onSuccess={() => { setIsCreateOpen(false); refetch(); }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!convenioAEliminar}
        onClose={() => setConvenioAEliminar(null)}
        onConfirm={handleDelete}
        title="Eliminar convenio de pago"
        description={`¿Eliminar el convenio de ${convenioAEliminar?.nombreCliente}? Esto también elimina todas sus cuotas. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
};
