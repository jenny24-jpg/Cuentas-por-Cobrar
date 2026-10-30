import { useState } from 'react';
import { Search, Undo2 } from 'lucide-react';
import { DataTable, TextInput, StatusBadge } from '../../../shared/ui-kit';
import { TrazabilidadActionModal } from '../../../shared/components';
import { usePaginatedList, useSolicitudesPendientes } from '../../../shared/hooks';
import { formatDateGT } from '../../../shared/date';
import type { AplicacionNotaCredito } from '@erp/contracts';
import { PieTabla, useTamanoPagina } from '../../../shared/components/PieTabla';

const money = (value: unknown) => `Q ${Number(value ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AplicacionesNotaCreditoPage = () => {
  const pend = useSolicitudesPendientes('REVERSA_APLICACION_NC');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanoPagina('cxc.credito.AplicacionesNotaCreditoPage');
  const [search, setSearch] = useState('');
  const [aReversar, setAReversar] = useState<AplicacionNotaCredito | null>(null);

  const { data, meta, isLoading, error, refetch } = usePaginatedList<AplicacionNotaCredito>(
    '/cxc/aplicaciones-nota-credito',
    { page, limit: pageSize, search },
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-slate-900 text-sm font-bold">Aplicaciones de Nota de Crédito</h1>
          <p className="text-sm text-slate-500">Historial de notas de crédito aplicadas (consulta y reversa). Una nota se aplica a su factura automáticamente cuando un administrador la aprueba en Notas de crédito; al reversarla vuelve a quedar por aprobar.</p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Una aplicación confirmada es inmutable. Para corregirla, reversa la aplicación con motivo y trazabilidad.
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <TextInput
          icon={Search} maxLength={100}
          placeholder="Buscar cliente, documento, nota de crédito o ID..."
          value={search}
          onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-md"
        />
      </div>

      {error && <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <DataTable
        isLoading={isLoading}
        data={data}
        emptyText="No hay aplicaciones de notas de crédito registradas"
        columns={[
          { header: 'ID', accessorKey: 'idAplicacionNc' },
          { header: 'Nota de Crédito', cell: ({ row }: any) => row.referenciaNota ?? `Nota #${row.idNotaCredito}` },
          { header: 'Documento', cell: ({ row }: any) => row.referenciaDocumento ?? `Documento #${row.idDocumento}` },
          { header: 'Monto Aplicado', accessorKey: 'montoAplicado', cell: ({ value }: any) => money(value) },
          { header: 'Fecha de Aplicación', accessorKey: 'fechaAplicacion', cell: ({ value }: any) => formatDateGT(value) },
          { header: 'Empleado', cell: ({ row }: any) => row.nombreEmpleado || (row.idEmpleado ? `#${row.idEmpleado}` : '—') },
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
              row.estado === 'CONFIRMADA' && pend.pendientes.has(row.idAplicacionNc) ? (
                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800" title="Espera la aprobación de un administrador">Reversa solicitada</span>
              ) : row.estado === 'CONFIRMADA' ? (
                <button
                  onClick={() => setAReversar(row)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md transition-colors"
                >
                  <Undo2 size={13} /> Solicitar reversa
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

      {aReversar && (
        <TrazabilidadActionModal
          title={`Solicitar reversa de aplicación #${aReversar.idAplicacionNc}`}
          description={`Al aprobarse, se le devolverá ${money(aReversar.montoAplicado)} al saldo del documento y la nota volverá a quedar por aprobar: para aplicarla otra vez, un administrador debe aprobarla de nuevo.`}
          endpoint={`/cxc/aplicaciones-nota-credito/${aReversar.idAplicacionNc}/reversar`}
          actionLabel="Solicitar reversa"
          requiereAutorizacion
          motivoLabel="Motivo de la reversa"
          motivoFieldName="motivoReversa"
          onClose={() => setAReversar(null)}
          onSuccess={() => { setAReversar(null); refetch(); pend.recargar(); }}
        />
      )}
    </div>
  );
};
