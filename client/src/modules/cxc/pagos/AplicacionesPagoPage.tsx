import { useState } from 'react';
import { Plus, Search, Undo2, Check, X as XIcon, CircleCheck } from 'lucide-react';
import { DataTable, Button, TextInput, StatusBadge, TextArea } from '../../../shared/ui-kit';
import { Modal, TrazabilidadActionModal, CampoUsuarioActual } from '../../../shared/components';
import { usePaginatedList } from '../../../shared/hooks';
import { formatDateGT } from '../../../shared/date';
import type { AplicacionPago } from '@erp/contracts';
import { AplicacionPagoForm } from './components/AplicacionPagoForm';
import { PieTabla, useTamanoPagina } from '../../../shared/components/PieTabla';
import { useAuth } from '../../../shared/auth/AuthContext';
import { apiClient, ApiError } from '../../../shared/api';

const money = (value: unknown) =>
  `Q ${Number(value ?? 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const AplicacionesPagoPage = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanoPagina('cxc.pagos.AplicacionesPagoPage');
  const [search, setSearch] = useState('');
  const [mensajeSolicitud, setMensajeSolicitud] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [aReversar, setAReversar] = useState<AplicacionPago | null>(null);
  const [decision, setDecision] = useState<{ item: AplicacionPago; accion: 'aprobar' | 'rechazar' } | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN';

  const resolverSolicitud = async () => {
    if (!decision) return;
    setDecisionBusy(true);
    setDecisionError(null);
    try {
      await apiClient.post(
        `/cxc/aplicaciones-pago/${decision.item.idAplicacion}/${decision.accion}`,
        decision.accion === 'rechazar' ? { motivoRechazo: motivoRechazo.trim() } : {},
        { successMessage: decision.accion === 'aprobar' ? 'Solicitud aprobada y aplicada.' : 'Solicitud rechazada.' },
      );
      setDecision(null);
      setMotivoRechazo('');
      refetch();
    } catch (err) {
      setDecisionError(err instanceof ApiError ? err.message : 'No se pudo procesar la solicitud.');
    } finally {
      setDecisionBusy(false);
    }
  };

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
            Los operadores solicitan la aplicación de pagos; un administrador debe aprobarla para actualizar el saldo de la factura. Las aplicaciones confirmadas pueden reversarse con trazabilidad.
          </p>
        </div>
        <Button icon={Plus} onClick={() => setModal(true)} className="shrink-0 whitespace-nowrap">
          {esAdmin ? 'Aplicar pago libre' : 'Solicitar aplicación'}
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Las solicitudes pendientes no modifican saldos. Al aprobarlas, se valida nuevamente el disponible del pago y el saldo de la factura.
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

      {mensajeSolicitud && (
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CircleCheck size={18} className="mt-0.5 shrink-0" />
          <p>{mensajeSolicitud}</p>
        </div>
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
                {row.estado === 'RECHAZADA' && row.motivoRechazo && <span className="text-[11px] text-slate-400 max-w-[220px] truncate" title={row.motivoRechazo}>{row.motivoRechazo}</span>}
                {row.estado === 'CONFIRMADA' && row.nombreEmpleadoAprobador && <span className="text-[11px] text-slate-400">Aprobó: {row.nombreEmpleadoAprobador}</span>}
                {row.estado === 'REVERSADA' && row.nombreEmpleadoReversa && (
                  <span className="text-[11px] text-slate-400">por {row.nombreEmpleadoReversa}</span>
                )}
              </div>
            ),
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) => row.estado === 'PENDIENTE' && esAdmin ? (
              <div className="flex justify-end gap-1">
                <button onClick={() => { setDecisionError(null); setDecision({ item: row, accion: 'aprobar' }); }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md" title="Aprobar solicitud"><Check size={15} /></button>
                <button onClick={() => { setMotivoRechazo(''); setDecisionError(null); setDecision({ item: row, accion: 'rechazar' }); }} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md" title="Rechazar solicitud"><XIcon size={15} /></button>
              </div>
            ) : row.estado === 'CONFIRMADA' ? (
              <button onClick={() => setAReversar(row)} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md transition-colors"><Undo2 size={13} /> Reversar</button>
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
          onSuccess={(result) => {
            setModal(false);
            setMensajeSolicitud(result?.estado === 'PENDIENTE'
              ? 'La solicitud quedó pendiente de aprobación por un usuario con rol Administrador. No se aplicará el pago hasta que sea aprobada.'
              : 'La aplicación de pago fue confirmada correctamente.');
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

      {decision && (
        <Modal
          isOpen
          onClose={() => !decisionBusy && setDecision(null)}
          title={decision.accion === 'aprobar' ? 'Aprobar aplicación de pago' : 'Rechazar solicitud'}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {decision.accion === 'aprobar'
                ? `Se aplicarán ${money(decision.item.montoAplicado)} al documento ${decision.item.referenciaDocumento ?? `#${decision.item.idDocumento}`}. Se validarán nuevamente los saldos.`
                : `La solicitud de ${money(decision.item.montoAplicado)} quedará rechazada y no afectará el saldo de la factura.`}
            </p>
            {decision.accion === 'rechazar' && <TextArea label="Motivo del rechazo" required rows={3} maxLength={250} value={motivoRechazo} onChange={(e: any) => setMotivoRechazo(e.target.value)} />}
            <CampoUsuarioActual label="Administrador responsable" />
            {decisionError && <p className="text-sm text-red-600">{decisionError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDecision(null)} disabled={decisionBusy}>Cancelar</Button>
              <Button variant={decision.accion === 'aprobar' ? 'primary' : 'danger'} onClick={resolverSolicitud} disabled={decisionBusy || (decision.accion === 'rechazar' && motivoRechazo.trim().length < 5)}>
                {decisionBusy ? 'Procesando…' : decision.accion === 'aprobar' ? 'Aprobar y aplicar' : 'Rechazar solicitud'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
