import { useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import type { EmpleadoAdmin } from '@erp/contracts';
import { Button, DataTable, Select, TextInput } from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { usePaginatedList, useSucursales } from '../../../shared/hooks';
import { EmpleadoForm } from './EmpleadoForm';
import { PieTabla, useTamanoPagina } from '../../../shared/components/PieTabla';

const Chip = ({ children, className }: { children: React.ReactNode; className: string }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${className}`}>{children}</span>
);

/** Listado de empleados con alta y edición, y el usuario de acceso que tiene cada uno. */
export function EmpleadosTabla() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanoPagina('admin.components.EmpleadosTabla');
  const [search, setSearch] = useState('');
  const [idSucursal, setIdSucursal] = useState('');
  const sucursales = useSucursales(false);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: EmpleadoAdmin } | null>(null);
  const { data, meta, isLoading, error, refetch } = usePaginatedList<EmpleadoAdmin>('/admin/usuarios/empleados/lista', { page, limit: pageSize, search, idSucursal: idSucursal || undefined });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-white p-4 rounded-lg border border-slate-200 flex-1 min-w-[260px]">
          <TextInput icon={Search} maxLength={100} placeholder="Buscar por nombre, código o puesto..." value={search}
            onChange={(e: any) => { setSearch(e.target.value); setPage(1); }} className="max-w-sm" />
          <Select label="Sucursal" value={idSucursal} helperText="" className="mt-3 max-w-sm"
            onChange={(e: any) => { setIdSucursal(e.target.value); setPage(1); }}
            options={[{ value: '', label: 'Todas las sucursales' }, ...sucursales.map((s) => ({ value: s.id, label: s.nombre }))]} />
        </div>
        <Button icon={Plus} onClick={() => setModal({ mode: 'create' })}>Nuevo empleado</Button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <DataTable
        isLoading={isLoading}
        data={data}
        emptyText="No hay empleados que coincidan con la búsqueda"
        columns={[
          { header: 'Código', cell: ({ row }: { row: EmpleadoAdmin }) => <span className="text-xs font-medium text-slate-600">{row.codigo ?? '—'}</span> },
          {
            header: 'Empleado',
            cell: ({ row }: { row: EmpleadoAdmin }) => (
              <div>
                <p className="font-semibold text-slate-900">{row.nombreCompleto}</p>
                <p className="text-xs text-slate-500">{[row.puesto, row.email, row.telefono].filter(Boolean).join(' · ') || 'Sin más datos'}</p>
              </div>
            ),
          },
          {
            header: 'Sucursal',
            cell: ({ row }: { row: EmpleadoAdmin }) => row.nombreSucursal
              ? <span className="text-sm text-slate-700">{row.nombreSucursal}</span>
              : <Chip className="bg-amber-50 text-amber-800 ring-amber-200">Sin sucursal</Chip>,
          },
          {
            header: 'Usuario de acceso',
            cell: ({ row }: { row: EmpleadoAdmin }) => row.usuarioVinculado
              ? <Chip className="bg-blue-50 text-blue-700 ring-blue-200">@{row.usuarioVinculado}</Chip>
              : <Chip className="bg-slate-100 text-slate-600 ring-slate-200">Sin usuario</Chip>,
          },
          {
            header: 'Estado',
            cell: ({ row }: { row: EmpleadoAdmin }) => row.estado === 'A'
              ? <Chip className="bg-emerald-50 text-emerald-700 ring-emerald-200">Activo</Chip>
              : <Chip className="bg-slate-100 text-slate-600 ring-slate-200">Inactivo</Chip>,
          },
          {
            header: '', align: 'right',
            cell: ({ row }: { row: EmpleadoAdmin }) => (
              <button
                type="button" onClick={() => setModal({ mode: 'edit', item: row })} title={`Editar a ${row.nombreCompleto}`} aria-label={`Editar a ${row.nombreCompleto}`}
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              ><Pencil size={15} /></button>
            ),
          },
        ]}
        paginationProps={{ currentPage: meta.page, totalPages: meta.totalPages, onPageChange: setPage, showingText: <PieTabla total={meta.total} pagina={meta.page} cantidad={data.length} tamano={pageSize} onTamanoChange={(t) => { setPageSize(t); setPage(1); }} etiqueta="empleados" /> }}
      />

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'edit' ? `Editar a ${modal.item?.nombreCompleto}` : 'Nuevo empleado'}
        description={modal?.mode === 'edit' ? undefined : 'Registra a una persona para poder vincularla a un usuario de acceso.'} size="lg">
        {modal && <EmpleadoForm item={modal.item} onCancel={() => setModal(null)} onSaved={() => { setModal(null); refetch(); }} />}
      </Modal>
    </>
  );
}
