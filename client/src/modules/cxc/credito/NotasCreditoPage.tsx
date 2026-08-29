import { useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import {
  DataTable,
  StatusBadge,
  Button,
  TextInput,
} from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { usePaginatedList } from '../../../shared/hooks';
import { apiClient, ApiError } from '../../../shared/api';
import type { NotaCredito } from '@erp/contracts';
import { NotaCreditoForm } from './components/NotaCreditoForm';

const PAGE_SIZE = 10;

const ESTADO_TONE: Record<string, string> = {
  ACTIVA: 'aprobada',
  ANULADA: 'rechazada',
};

export const NotasCreditoPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const [modalState, setModalState] = useState<{
    mode: 'create' | 'edit';
    nota?: NotaCredito;
  } | null>(null);

  const [notaAEliminar, setNotaAEliminar] =
    useState<NotaCredito | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const { data, meta, isLoading, error, refetch } =
    usePaginatedList<NotaCredito>(
      '/cxc/notas-credito',
      {
        page,
        limit: PAGE_SIZE,
        search,
      },
    );

  const handleDelete = async () => {
    if (!notaAEliminar) return;

    setIsDeleting(true);

    try {
      await apiClient.delete(
        `/cxc/notas-credito/${notaAEliminar.idNotaCredito}`,
      );

      setNotaAEliminar(null);
      refetch();
    } catch (err) {
      console.error(
        err instanceof ApiError ? err.message : err,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Notas de Crédito
          </h1>

          <p className="text-sm text-slate-500">
            Administración de notas de crédito asociadas a clientes y
            documentos.
          </p>
        </div>

        <Button
          icon={Plus}
          onClick={() =>
            setModalState({
              mode: 'create',
            })
          }
        >
          Nueva Nota
        </Button>
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <TextInput
          icon={Search}
          placeholder="Buscar nota de crédito..."
          value={search}
          onChange={(e: any) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <DataTable
        isLoading={isLoading}
        data={data}
        emptyText="No hay notas de crédito registradas"
        columns={[
          {
            header: 'ID',
            accessorKey: 'idNotaCredito',
          },
          {
            header: 'Cliente',
            accessorKey: 'idCliente',
          },
          {
            header: 'Serie',
            accessorKey: 'serie',
            cell: ({ value }: any) => value || '-',
          },
          {
            header: 'Número',
            accessorKey: 'numero',
            cell: ({ value }: any) => value || '-',
          },
          {
            header: 'Fecha',
            accessorKey: 'fecha',
            cell: ({ value }: any) =>
              value
                ? new Date(value).toLocaleDateString()
                : '-',
          },
          {
            header: 'Monto',
            accessorKey: 'monto',
            cell: ({ value }: any) =>
              Number(value).toLocaleString('es-GT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
          },
          {
            header: 'Estado',
            cell: ({ row }: any) => (
              <StatusBadge
                status={ESTADO_TONE[row.estado] ?? 'pendiente'}
                label={
                  row.estado === 'ACTIVA'
                    ? 'Activa'
                    : 'Anulada'
                }
              />
            ),
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() =>
                    setModalState({
                      mode: 'edit',
                      nota: row,
                    })
                  }
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title="Editar"
                >
                  <Pencil size={15} />
                </button>

                <button
                  onClick={() => setNotaAEliminar(row)}
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
        title={
          modalState?.mode === 'edit'
            ? 'Editar Nota de Crédito'
            : 'Nueva Nota de Crédito'
        }
      >
        <NotaCreditoForm
          nota={modalState?.nota}
          onCancel={() => setModalState(null)}
          onSuccess={() => {
            setModalState(null);
            refetch();
          }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!notaAEliminar}
        onClose={() => setNotaAEliminar(null)}
        onConfirm={handleDelete}
        title="Eliminar nota de crédito"
        description={`¿Eliminar la nota de crédito ${notaAEliminar?.serie ?? ''} ${notaAEliminar?.numero ?? ''}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
};