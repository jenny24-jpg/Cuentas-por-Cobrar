import { useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import {
  DataTable,
  Button,
  TextInput,
} from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { usePaginatedList } from '../../../shared/hooks';
import { apiClient, ApiError } from '../../../shared/api';
import type { AplicacionNotaCredito } from '@erp/contracts';
import { AplicacionNotaCreditoForm } from './components/AplicacionNotaCreditoForm';

const PAGE_SIZE = 10;

export const AplicacionesNotaCreditoPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const [modalState, setModalState] = useState<{
    mode: 'create' | 'edit';
    aplicacion?: AplicacionNotaCredito;
  } | null>(null);

  const [aplicacionAEliminar, setAplicacionAEliminar] =
    useState<AplicacionNotaCredito | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const { data, meta, isLoading, error, refetch } =
    usePaginatedList<AplicacionNotaCredito>(
      '/cxc/aplicaciones-nota-credito',
      {
        page,
        limit: PAGE_SIZE,
        search,
      },
    );

  const handleDelete = async () => {
    if (!aplicacionAEliminar) return;

    setIsDeleting(true);

    try {
      await apiClient.delete(
        `/cxc/aplicaciones-nota-credito/${aplicacionAEliminar.idAplicacionNc}`,
      );

      setAplicacionAEliminar(null);
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
            Aplicaciones de Nota de Crédito
          </h1>

          <p className="text-sm text-slate-500">
            Aplicación de notas de crédito a documentos pendientes.
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
          Nueva Aplicación
        </Button>
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <TextInput
          icon={Search}
          placeholder="Buscar aplicación..."
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
        emptyText="No hay aplicaciones de notas de crédito registradas"
        columns={[
          {
            header: 'ID',
            accessorKey: 'idAplicacionNc',
          },
          {
            header: 'Nota de Crédito',
            accessorKey: 'idNotaCredito',
            cell: ({ value }: any) =>
              `NC #${value}`,
          },
          {
            header: 'Documento',
            accessorKey: 'idDocumento',
            cell: ({ value }: any) =>
              `Documento #${value}`,
          },
          {
            header: 'Monto Aplicado',
            accessorKey: 'montoAplicado',
            cell: ({ value }: any) =>
              Number(value).toLocaleString('es-GT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
          },
          {
            header: 'Fecha de Aplicación',
            accessorKey: 'fechaAplicacion',
            cell: ({ value }: any) =>
              value
                ? new Date(value).toLocaleDateString('es-GT')
                : '-',
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
                      aplicacion: row,
                    })
                  }
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title="Editar"
                >
                  <Pencil size={15} />
                </button>

                <button
                  onClick={() =>
                    setAplicacionAEliminar(row)
                  }
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
            ? 'Editar Aplicación de Nota de Crédito'
            : 'Nueva Aplicación de Nota de Crédito'
        }
      >
        <AplicacionNotaCreditoForm
          aplicacion={modalState?.aplicacion}
          onCancel={() => setModalState(null)}
          onSuccess={() => {
            setModalState(null);
            refetch();
          }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!aplicacionAEliminar}
        onClose={() => setAplicacionAEliminar(null)}
        onConfirm={handleDelete}
        title="Eliminar aplicación"
        description={`¿Eliminar la aplicación #${aplicacionAEliminar?.idAplicacionNc ?? ''}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
};