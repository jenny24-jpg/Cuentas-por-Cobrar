import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { DataTable, Button, TextInput } from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { usePaginatedList } from '../../../shared/hooks';
import type { AplicacionNotaCredito } from '@erp/contracts';
import { AplicacionNotaCreditoForm } from './components/AplicacionNotaCreditoForm';

const PAGE_SIZE = 10;
const money = (value: unknown) => `Q ${Number(value ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString('es-GT') : '—';

export const AplicacionesNotaCreditoPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const { data, meta, isLoading, error, refetch } = usePaginatedList<AplicacionNotaCredito>(
    '/cxc/aplicaciones-nota-credito',
    { page, limit: PAGE_SIZE, search },
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Aplicaciones de Nota de Crédito</h1>
          <p className="text-sm text-slate-500">La NC reduce el saldo únicamente cuando se aplica al documento.</p>
        </div>
        <Button icon={Plus} onClick={() => setOpen(true)}>Nueva Aplicación</Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Una aplicación confirmada es inmutable. Las correcciones deben hacerse mediante reversión para conservar trazabilidad.
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <TextInput
          icon={Search}
          placeholder="Buscar aplicación..."
          value={search}
          onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <DataTable
        isLoading={isLoading}
        data={data}
        emptyText="No hay aplicaciones de notas de crédito registradas"
        columns={[
          { header: 'ID', accessorKey: 'idAplicacionNc' },
          { header: 'Nota de Crédito', cell: ({ row }: any) => `NC #${row.idNotaCredito}` },
          { header: 'Documento', cell: ({ row }: any) => `Documento #${row.idDocumento}` },
          { header: 'Monto Aplicado', accessorKey: 'montoAplicado', cell: ({ value }: any) => money(value) },
          { header: 'Fecha de Aplicación', accessorKey: 'fechaAplicacion', cell: ({ value }: any) => date(value) },
        ]}
        paginationProps={{
          currentPage: meta.page,
          totalPages: meta.totalPages,
          onPageChange: setPage,
          showingText: `Mostrando ${data.length} de ${meta.total} registros`,
        }}
      />

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Nueva Aplicación de Nota de Crédito">
        <AplicacionNotaCreditoForm
          aplicacion={null}
          onCancel={() => setOpen(false)}
          onSuccess={() => { setOpen(false); refetch(); }}
        />
      </Modal>
    </div>
  );
};
