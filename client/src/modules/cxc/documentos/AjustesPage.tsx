import { useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { DataTable, Button, TextInput } from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { usePaginatedList } from '../../../shared/hooks';
import { apiClient, ApiError } from '../../../shared/api';
import { formatDateGT } from '../../../shared/date';
import type { Ajuste } from '@erp/contracts';
import { AjusteForm } from './components/AjusteForm';

const PAGE_SIZE = 10;

export const AjustesPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalState, setModalState] = useState<{ mode: 'create' | 'edit'; ajuste?: Ajuste } | null>(null);
  const [ajusteAEliminar, setAjusteAEliminar] = useState<Ajuste | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, meta, isLoading, error, refetch } = usePaginatedList<Ajuste>(
    '/cxc/ajustes',
    { page, limit: PAGE_SIZE, search },
  );

  const handleDelete = async () => {
    if (!ajusteAEliminar) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/cxc/ajustes/${ajusteAEliminar.idAjuste}`);
      setAjusteAEliminar(null);
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
          <h1 className="text-2xl font-bold text-slate-900">Ajustes de Cartera</h1>
          <p className="text-sm text-slate-500">CRUD de CXC_AJUSTES.</p>
        </div>
        <Button icon={Plus} onClick={() => setModalState({ mode: 'create' })}>
          Nuevo Ajuste
        </Button>
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <TextInput
          icon={Search}
          placeholder="Buscar cliente, tipo, motivo o documento..."
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
        emptyText="No hay ajustes registrados"
        columns={[
          { header: 'Cliente', accessorKey: 'nombreCliente' },
          { header: 'Documento', accessorKey: 'idDocumento', cell: ({ value }: any) => value ?? '—' },
          { header: 'Tipo', accessorKey: 'tipoAjuste' },
          { header: 'Monto', accessorKey: 'monto', cell: ({ value }: any) => `Q ${Number(value).toFixed(2)}` },
          { header: 'Fecha', accessorKey: 'fecha', cell: ({ value }: any) => formatDateGT(value) },
          { header: 'Empleado', accessorKey: 'nombreEmpleado' },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => setModalState({ mode: 'edit', ajuste: row })}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title="Editar"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setAjusteAEliminar(row)}
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

      <Modal
        isOpen={!!modalState}
        onClose={() => setModalState(null)}
        title={modalState?.mode === 'edit' ? 'Editar Ajuste' : 'Nuevo Ajuste'}
      >
        <AjusteForm
          ajuste={modalState?.ajuste}
          onCancel={() => setModalState(null)}
          onSuccess={() => { setModalState(null); refetch(); }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!ajusteAEliminar}
        onClose={() => setAjusteAEliminar(null)}
        onConfirm={handleDelete}
        title="Eliminar ajuste"
        description={`¿Eliminar el ajuste #${ajusteAEliminar?.idAjuste}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
};
