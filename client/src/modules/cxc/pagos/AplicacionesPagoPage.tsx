import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { DataTable, Button, TextInput } from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { usePaginatedList } from '../../../shared/hooks';
import { formatDateGT } from '../../../shared/date';
import type { AplicacionPago } from '@erp/contracts';
import { AplicacionPagoForm } from './components/AplicacionPagoForm';

const money = (value: unknown) =>
  `Q ${Number(value ?? 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const AplicacionesPagoPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);

  const { data, meta, isLoading, error, refetch } =
    usePaginatedList<AplicacionPago>('/cxc/aplicaciones-pago', {
      page,
      limit: 10,
      search,
    });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Aplicaciones de Pago</h1>
          <p className="text-sm text-slate-500">
            Aplicar un pago reduce el saldo del documento dentro de una transacción segura.
          </p>
        </div>
        <Button icon={Plus} onClick={() => setModal(true)}>
          Nueva Aplicación
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Una aplicación confirmada es inmutable. Para corregirla debe utilizarse una reversión; no se edita ni se elimina físicamente.
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200">
        <TextInput
          icon={Search}
          placeholder="Buscar por pago, documento, empleado o ID..."
          value={search}
          onChange={(e: any) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-md"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <DataTable
        isLoading={isLoading}
        data={data}
        emptyText="No hay aplicaciones de pago registradas"
        columns={[
          { header: 'ID', accessorKey: 'idAplicacion' },
          {
            header: 'Pago',
            cell: ({ row }: any) => row.referenciaPago || `Pago #${row.idPago}`,
          },
          {
            header: 'Documento',
            cell: ({ row }: any) => row.referenciaDocumento || `Documento #${row.idDocumento}`,
          },
          {
            header: 'Fecha',
            accessorKey: 'fechaAplicacion',
            cell: ({ value }: any) => formatDateGT(value),
          },
          {
            header: 'Monto aplicado',
            accessorKey: 'montoAplicado',
            cell: ({ value }: any) => money(value),
          },
          {
            header: 'Empleado',
            cell: ({ row }: any) => row.nombreEmpleado || (row.idEmpleado ? `#${row.idEmpleado}` : '—'),
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
        isOpen={modal}
        onClose={() => setModal(false)}
        title="Nueva Aplicación de Pago"
      >
        <AplicacionPagoForm
          item={null}
          onCancel={() => setModal(false)}
          onSuccess={() => {
            setModal(false);
            refetch();
          }}
        />
      </Modal>
    </div>
  );
};
