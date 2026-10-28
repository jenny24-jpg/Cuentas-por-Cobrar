import { useEffect, useState, type ReactNode } from 'react';
import { BadgeCheck, CalendarClock, FileText, Pencil, TriangleAlert, Wallet } from 'lucide-react';
import { StatusBadge, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import { moneyGT } from '../../../../shared/csv';
import { describirCondicionPago, type ClienteDetalle as Detalle } from '@erp/contracts';

const Dato = ({ etiqueta, children }: { etiqueta: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-slate-500">{etiqueta}</dt>
    <dd className="mt-0.5 font-medium text-slate-900 break-words">{children}</dd>
  </div>
);

const Seccion = ({ titulo, icono, children }: { titulo: string; icono: ReactNode; children: ReactNode }) => (
  <section className="rounded-xl border border-slate-200 p-4">
    <h3 className="mb-3 flex items-center gap-2 text-slate-800">{icono}{titulo}</h3>
    {children}
  </section>
);

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });

interface ClienteDetalleProps {
  idCliente: number;
  puedeEditar: boolean;
  onEditar: (cliente: Detalle) => void;
  onCerrar: () => void;
}

/** Vista de solo lectura con los datos del cliente, su condición de pago y su cartera. */
export const ClienteDetalle = ({ idCliente, puedeEditar, onEditar, onCerrar }: ClienteDetalleProps) => {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setDetalle(null);
    setError(null);
    apiClient.get<Detalle>(`/cxc/clientes/${idCliente}/detalle`)
      .then((d) => { if (vigente) setDetalle(d); })
      .catch((e) => { if (vigente) setError(e instanceof ApiError ? e.message : 'No se pudo cargar el cliente.'); });
    return () => { vigente = false; };
  }, [idCliente]);

  if (error) return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600">{error}</p>;
  if (!detalle) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Cargando cliente">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
      </div>
    );
  }

  const { resumen } = detalle;
  const credito = (detalle.diasCredito ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-500">Cliente #{detalle.idCliente}</p>
          <p className="truncate font-bold text-slate-900" style={{ fontSize: 16 }}>{detalle.nombre}</p>
        </div>
        <StatusBadge status={detalle.estado ?? ''} label={detalle.estado === 'A' ? 'Activo' : detalle.estado === 'I' ? 'Inactivo' : 'Sin estado'} />
      </div>

      <Seccion titulo="Datos generales" icono={<FileText size={15} className="text-blue-700" aria-hidden="true" />}>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="ID Cliente">#{detalle.idCliente}</Dato>
          <Dato etiqueta="NIT">
            <span className="inline-flex items-center gap-1.5">
              {detalle.nit || '—'}
              {detalle.nit && (detalle.nitValido
                ? <BadgeCheck size={15} className="text-emerald-600" aria-label="NIT válido" />
                : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700"><TriangleAlert size={12} aria-hidden="true" />Dígito verificador inválido</span>)}
            </span>
          </Dato>
        </dl>
      </Seccion>

      <Seccion titulo="Condición de pago" icono={<CalendarClock size={15} className="text-blue-700" aria-hidden="true" />}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato etiqueta="Tipo">{detalle.diasCredito === null ? 'Sin condición' : credito ? 'Crédito' : 'Contado'}</Dato>
          <Dato etiqueta="Plazo">{credito ? describirCondicionPago(detalle.diasCredito).replace('Crédito ', '') : '—'}</Dato>
          <Dato etiqueta="Días de gracia">{detalle.diasGracia ?? '—'}</Dato>
          <Dato etiqueta="Mora">{detalle.porcentajeMora !== null ? `${Number(detalle.porcentajeMora)} %` : '—'}</Dato>
        </dl>
      </Seccion>

      <Seccion titulo="Cartera" icono={<Wallet size={15} className="text-blue-700" aria-hidden="true" />}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato etiqueta="Saldo pendiente">{moneyGT(resumen.saldoPendiente)}</Dato>
          <Dato etiqueta="Saldo vencido">
            <span className={resumen.saldoVencido > 0 ? 'text-red-600' : undefined}>{moneyGT(resumen.saldoVencido)}</span>
          </Dato>
          <Dato etiqueta="Documentos abiertos">{resumen.documentosAbiertos}{resumen.documentosVencidos ? ` (${resumen.documentosVencidos} vencidos)` : ''}</Dato>
          <Dato etiqueta="Último pago">{resumen.ultimoPago ? fechaLarga(resumen.ultimoPago) : 'Sin pagos'}</Dato>
        </dl>
      </Seccion>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCerrar}>Cerrar</Button>
        {puedeEditar && <Button icon={Pencil} onClick={() => onEditar(detalle)}>Editar cliente</Button>}
      </div>
    </div>
  );
};
