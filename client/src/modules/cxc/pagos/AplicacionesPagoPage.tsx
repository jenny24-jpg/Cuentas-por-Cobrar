import { useState } from 'react';
import { Plus, Search, Undo2 } from 'lucide-react';
import { DataTable, Button, TextInput, StatusBadge } from '../../../shared/ui-kit';
import { Modal, TrazabilidadActionModal } from '../../../shared/components';
import { usePaginatedList } from '../../../shared/hooks';
import { formatDateGT } from '../../../shared/date';
import type { AplicacionPago } from '@erp/contracts';
import { AplicacionPagoForm } from './components/AplicacionPagoForm';
import { PieTabla, useTamanoPagina } from '../../../shared/components/PieTabla';

const money = (value: unknown) =>
  `Q ${Number(value ?? 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const AplicacionesPagoPage = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanoPagina('cxc.pagos.AplicacionesPagoPage');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [aReversar, setAReversar] = useState<AplicacionPago | null>(null);

  const { data, meta, isLoading, error, refetch } =
    usePaginatedList<AplicacionPago>('/cxc/aplicaciones-pago', {
      page,
      limit: pageSize,
      search,
    });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-slate-900 text-sm font-bold">Aplicaciones de Pago</h1>
          <p className="text-sm text-slate-500">
            Historial de pagos aplicados a facturas (consulta y reversa). Los pagos nuevos se aplican al registrarlos en Pagos; aquí solo se aplica lo que quedó libre: depósitos no identificados o pagos anteriores con saldo disponible.
          </p>
        </div>
        <Button icon={Plus} onClick={() => setModal(true)} className="shrink-0 whitespace-nowrap">
          Aplicar pago libre
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Una aplicación confirmada es inmutable. Para corregirla, reversa la aplicación con motivo y trazabilidad.
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200">
        <TextInput
          icon={Search} maxLength={100}
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
          {
            header: 'Estado',
            cell: ({ row }: any) => (
              <div className="flex flex-col gap-0.5">
                <StatusBadge status={row.estado} />
                {row.estado === 'REVERSADA' && row.nombreEmpleadoReversa && (
                  <span className="text-[11px] text-slate-400">por {row.nombreEmpleadoReversa}</span>
                )}
              </div>
            ),
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) =>
              row.estado === 'CONFIRMADA' ? (
                <button
                  onClick={() => setAReversar(row)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md transition-colors"
                >
                  <Undo2 size={13} /> Reversar
                </button>
              ) : null,
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

      {aReversar && (
        <TrazabilidadActionModal
          title={`Reversar aplicación #${aReversar.idAplicacion}`}
          description={`Se le devolverá ${money(aReversar.montoAplicado)} al saldo del documento y al disponible del pago.`}
          endpoint={`/cxc/aplicaciones-pago/${aReversar.idAplicacion}/reversar`}
          actionLabel="Reversar"
          motivoLabel="Motivo de la reversa"
          motivoFieldName="motivoReversa"
          onClose={() => setAReversar(null)}
          onSuccess={() => { setAReversar(null); refetch(); }}
        />
      )}
    </div>
  );
};
