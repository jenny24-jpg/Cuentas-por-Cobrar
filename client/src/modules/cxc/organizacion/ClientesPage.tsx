import { useState } from 'react';
import { Eye, Pencil, Plus, Search } from 'lucide-react';
import { DataTable, StatusBadge, TextInput, Select, Button } from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { usePaginatedList } from '../../../shared/hooks';
import { useAuth } from '../../../shared/auth/AuthContext';
import type { Cliente } from '@erp/contracts';
import { ClienteForm } from './components/ClienteForm';
import { ClienteDetalle } from './components/ClienteDetalle';
import { PieTabla, useTamanoPagina } from '../../../shared/components/PieTabla';


const ESTADO_FILTRO = [
  { value: '', label: 'Todos los estados' },
  { value: 'A', label: 'Activos' },
  { value: 'I', label: 'Inactivos' },
];

const etiquetaEstado = (estado: string | null) => (estado === 'A' ? 'Activo' : estado === 'I' ? 'Inactivo' : 'Sin estado');

/** Alta, consulta y edición de clientes. */
export const ClientesPage = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanoPagina('cxc.organizacion.ClientesPage');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [verId, setVerId] = useState<number | null>(null);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [creando, setCreando] = useState(false);
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol !== 'CONSULTA';

  const { data, meta, isLoading, error, refetch } = usePaginatedList<Cliente>(
    '/cxc/clientes',
    { page, limit: pageSize, search, ...(estado ? { estado } : {}) },
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-slate-900 text-sm font-bold">Clientes</h1>
          <p className="text-sm text-slate-500">Clientes registrados en el ERP con su condición de pago y estado. Usa <strong>Ver</strong> para el detalle y <strong>Editar</strong> para modificarlos.</p>
        </div>
        {puedeEditar && (
          <Button icon={Plus} onClick={() => setCreando(true)}>
            Nuevo Cliente
          </Button>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextInput
          icon={Search}
          placeholder="Buscar por ID, código de cobro, nombre, NIT o dirección..."
          value={search}
          onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
          className="sm:max-w-sm"
          maxLength={100}
          helperText=""
        />
        <Select
          value={estado}
          onChange={(e: any) => { setEstado(e.target.value); setPage(1); }}
          options={ESTADO_FILTRO}
          placeholder=""
          className="sm:max-w-[200px]"
          helperText=""
          aria-label="Filtrar por estado"
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
        emptyText={search || estado ? 'Ningún cliente coincide con la búsqueda' : 'No hay clientes registrados'}
        columns={[
          { header: 'Código', accessorKey: 'codigoCliente', cell: ({ value }: any) => <span className="font-semibold tabular-nums text-slate-800">{value ?? '—'}</span> },
          { header: 'ID Cliente', accessorKey: 'idCliente', cell: ({ value }: any) => <span className="tabular-nums text-slate-500">#{value}</span> },
          { header: 'Nombre del cliente', accessorKey: 'nombre', cell: ({ value }: any) => <span className="font-medium text-slate-900">{value}</span> },
          { header: 'Código cobro', accessorKey: 'codigoCobro', cell: ({ value }: any) => <span className="tabular-nums font-medium text-blue-800">{value}</span> },
          { header: 'NIT', accessorKey: 'nit', cell: ({ value }: any) => <span className="tabular-nums">{value || '—'}</span> },
          {
            header: 'Dirección',
            accessorKey: 'direccion',
            cell: ({ value }: any) => value
              ? <span className="block max-w-xs truncate" title={value}>{value}</span>
              : <span className="text-amber-700">Sin dirección</span>,
          },
          {
            header: 'Segmento',
            cell: ({ row }: { row: Cliente }) => row.segmento
              ? (
                <span
                  className="inline-flex min-w-7 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800"
                  title={row.reduccionMora ? `Mora −${row.reduccionMora} puntos` : 'Sin reducción de mora'}
                >
                  {row.segmento}
                </span>
              )
              : <span className="text-slate-400">—</span>,
          },
          {
            header: 'Condición de pago',
            cell: ({ row }: { row: Cliente }) => {
              if (row.diasCredito === null) return <span className="text-slate-400">Sin condición</span>;
              const credito = row.diasCredito > 0;
              return (
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 ${credito ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                  {credito ? 'Crédito' : 'Contado'}
                </span>
              );
            },
          },
          {
            header: 'Plazo',
            cell: ({ row }: { row: Cliente }) => {
              if (row.diasCredito === null || row.diasCredito <= 0) return <span className="text-slate-400">—</span>;
              return (
                <div className="leading-tight">
                  <span className="tabular-nums text-slate-900">{row.diasCredito} {row.diasCredito === 1 ? 'día' : 'días'}</span>
                  {row.diasGracia ? (
                    <span className="block text-slate-400">+{row.diasGracia} {row.diasGracia === 1 ? 'día' : 'días'} de gracia</span>
                  ) : null}
                </div>
              );
            },
          },
          {
            header: 'Estado',
            cell: ({ row }: { row: Cliente }) => (
              <StatusBadge status={row.estado ?? ''} label={etiquetaEstado(row.estado)} />
            ),
          },
          {
            header: 'Acciones',
            align: 'right',
            cell: ({ row }: { row: Cliente }) => (
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setVerId(row.idCliente)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  title="Ver cliente"
                  aria-label={`Ver cliente ${row.nombre}`}
                >
                  <Eye size={15} />
                </button>
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => setEditando(row)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    title="Editar cliente"
                    aria-label={`Editar cliente ${row.nombre}`}
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            ),
          },
        ]}
        paginationProps={{
          currentPage: meta.page,
          totalPages: meta.totalPages,
          onPageChange: setPage,
          showingText: <PieTabla total={meta.total} pagina={meta.page} cantidad={data.length} tamano={pageSize} onTamanoChange={(t) => { setPageSize(t); setPage(1); }} etiqueta="clientes" />,
        }}
      />

      <Modal isOpen={verId !== null} onClose={() => setVerId(null)} title="Detalle del cliente" size="lg">
        {verId !== null && (
          <ClienteDetalle
            idCliente={verId}
            puedeEditar={puedeEditar}
            onCerrar={() => setVerId(null)}
            onEditar={(cliente) => { setVerId(null); setEditando(cliente); }}
          />
        )}
      </Modal>

      <Modal isOpen={creando} onClose={() => setCreando(false)} title="Nuevo Cliente">
        {creando && (
          <ClienteForm
            onCancel={() => setCreando(false)}
            onSuccess={() => { setCreando(false); setPage(1); refetch(); }}
          />
        )}
      </Modal>

      <Modal isOpen={!!editando} onClose={() => setEditando(null)} title="Editar cliente">
        {editando && (
          <ClienteForm
            key={editando.idCliente}
            cliente={editando}
            onCancel={() => setEditando(null)}
            onSuccess={() => { setEditando(null); refetch(); }}
          />
        )}
      </Modal>
    </div>
  );
};
