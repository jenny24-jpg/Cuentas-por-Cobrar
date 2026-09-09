import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, DollarSign } from 'lucide-react';
import { DataTable, StatusBadge, Button, TextInput, Select } from '../../../shared/ui-kit';
import { Modal } from '../../../shared/components';
import { apiClient, ApiError } from '../../../shared/api';
import { validateRequiredSelect, validateNumber, hasErrors, type ValidationErrors } from '../../../shared/validation';
import type { ConvenioPago, ConvenioCuota, FormaPagoOption } from '@erp/contracts';

const ESTADO_CUOTA_TONE: Record<string, string> = {
  PENDIENTE: 'pendiente',
  PAGADA: 'aprobada',
  VENCIDA: 'rechazada',
};

export const ConvenioDetallePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [convenio, setConvenio] = useState<ConvenioPago | null>(null);
  const [cuotas, setCuotas] = useState<ConvenioCuota[]>([]);
  const [formasPago, setFormasPago] = useState<FormaPagoOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cuotaAPagar, setCuotaAPagar] = useState<ConvenioCuota | null>(null);
  const [montoPagado, setMontoPagado] = useState('');
  const [idFormaPago, setIdFormaPago] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    Promise.all([
      apiClient.get<ConvenioPago>(`/cxc/convenios-pago/${id}`),
      apiClient.get<ConvenioCuota[]>(`/cxc/convenios-pago/${id}/cuotas`),
    ])
      .then(([conv, cuotasList]) => {
        setConvenio(conv);
        setCuotas(cuotasList);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el convenio'))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    apiClient.get<FormaPagoOption[]>('/cxc/catalogos/formas-pago').then(setFormasPago).catch(() => setFormasPago([]));
  }, []);

  const formaPagoSeleccionada = formasPago.find((f) => f.id === Number(idFormaPago));

  const abrirModalPago = (cuota: ConvenioCuota) => {
    setCuotaAPagar(cuota);
    setMontoPagado(String(cuota.saldo));
    setIdFormaPago('');
    setReferenciaPago('');
    setErrors({});
    setPayError(null);
  };

  const validate = (): ValidationErrors => {
    const next: ValidationErrors = {};

    if (!montoPagado || montoPagado.trim() === '') {
      next.montoPagado = 'El monto pagado es obligatorio.';
    } else {
      const montoErr = validateNumber(montoPagado, 'El monto pagado', { positive: true });
      if (montoErr) {
        next.montoPagado = montoErr;
      } else if (cuotaAPagar && Number(montoPagado) > Number(cuotaAPagar.saldo)) {
        next.montoPagado = `No puede ser mayor al saldo pendiente (Q ${Number(cuotaAPagar.saldo).toFixed(2)}).`;
      }
    }

    const formaPagoErr = validateRequiredSelect(idFormaPago, 'una forma de pago');
    if (formaPagoErr) next.idFormaPago = formaPagoErr;

    // La referencia es obligatoria SOLO si la forma de pago elegida lo exige
    // (cheque, transferencia, depósito...) — efectivo, por ejemplo, no.
    if (formaPagoSeleccionada?.requiereReferencia && (!referenciaPago || referenciaPago.trim() === '')) {
      next.referenciaPago = `${formaPagoSeleccionada.label} requiere un número de referencia.`;
    }

    return next;
  };

  const handlePagar = async () => {
    if (!cuotaAPagar) return;
    setPayError(null);

    const validationErrors = validate();
    if (hasErrors(validationErrors)) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setIsPaying(true);

    try {
      await apiClient.post(`/cxc/convenios-pago/cuotas/${cuotaAPagar.idCuota}/pagos`, {
        montoPagado: Number(montoPagado),
        idFormaPago: Number(idFormaPago),
        referenciaPago: referenciaPago || undefined,
      });
      setCuotaAPagar(null);
      cargar();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'No se pudo registrar el pago');
    } finally {
      setIsPaying(false);
    }
  };

  if (isLoading) {
    return <p className="text-slate-400 text-center py-12">Cargando convenio...</p>;
  }

  if (error || !convenio) {
    return <p className="text-red-600 text-center py-12">{error ?? 'Convenio no encontrado'}</p>;
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/cxc/cobranza/convenios-pago')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft size={15} /> Volver a Convenios de Pago
      </button>

      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{convenio.nombreCliente}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Convenio del {convenio.fechaConvenio.slice(0, 10)} · {convenio.numeroCuotas} cuotas
            </p>
          </div>
          <StatusBadge status={convenio.estado === 'ACTIVO' ? 'revision' : convenio.estado === 'CUMPLIDO' ? 'aprobada' : 'rechazada'} label={convenio.estado} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100 text-sm">
          <div>
            <p className="text-slate-400 text-xs uppercase font-semibold">Monto total</p>
            <p className="font-bold text-slate-900 mt-1">Q {Number(convenio.montoDeuda).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase font-semibold">Saldo pendiente</p>
            <p className="font-bold text-slate-900 mt-1">
              Q {cuotas.reduce((acc, c) => acc + Number(c.saldo), 0).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase font-semibold">Cuotas pagadas</p>
            <p className="font-bold text-slate-900 mt-1">
              {cuotas.filter((c) => c.estado === 'PAGADA').length} / {cuotas.length}
            </p>
          </div>
        </div>
      </div>

      <DataTable
        data={cuotas}
        emptyText="Este convenio no tiene cuotas generadas"
        columns={[
          { header: '#', accessorKey: 'numeroCuota', align: 'center' },
          { header: 'Vencimiento', accessorKey: 'fechaVencimiento', cell: ({ value }: any) => value?.slice(0, 10) },
          { header: 'Monto', accessorKey: 'monto', cell: ({ value }: any) => `Q ${Number(value).toFixed(2)}` },
          { header: 'Saldo', accessorKey: 'saldo', cell: ({ value }: any) => `Q ${Number(value).toFixed(2)}` },
          { header: 'Forma de pago', cell: ({ row }: any) => row.nombreFormaPago ?? '—' },
          {
            header: 'Estado',
            cell: ({ row }: any) => <StatusBadge status={ESTADO_CUOTA_TONE[row.estado]} label={row.estado} />,
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) =>
              row.estado !== 'PAGADA' ? (
                <button
                  onClick={() => abrirModalPago(row)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md transition-colors"
                >
                  <DollarSign size={13} /> Registrar pago
                </button>
              ) : null,
          },
        ]}
      />

      <Modal
        isOpen={!!cuotaAPagar}
        onClose={() => setCuotaAPagar(null)}
        title={`Registrar pago — Cuota ${cuotaAPagar?.numeroCuota}`}
        description={`Saldo actual: Q ${Number(cuotaAPagar?.saldo ?? 0).toFixed(2)}`}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <TextInput
            label="Monto pagado"
            type="number"
            step="0.01"
            required
            value={montoPagado}
            onChange={(e: any) => setMontoPagado(e.target.value)}
            error={errors.montoPagado}
            helperText="No puede superar el saldo pendiente de la cuota."
          />

          <Select
            label="Forma de pago"
            required
            value={idFormaPago}
            onChange={(e: any) => { setIdFormaPago(e.target.value); setReferenciaPago(''); }}
            options={formasPago.map((f) => ({ value: f.id, label: f.label }))}
            error={errors.idFormaPago}
            helperText="Cómo se recibió el pago de esta cuota."
          />

          {formaPagoSeleccionada && (
            <TextInput
              label="Número de referencia"
              required={formaPagoSeleccionada.requiereReferencia}
              value={referenciaPago}
              onChange={(e: any) => setReferenciaPago(e.target.value)}
              error={errors.referenciaPago}
              helperText={
                formaPagoSeleccionada.requiereReferencia
                  ? `${formaPagoSeleccionada.label} requiere número de referencia (boleta, cheque, transacción).`
                  : 'Opcional para esta forma de pago.'
              }
            />
          )}

          {payError && <p className="text-sm text-red-600 font-medium">{payError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCuotaAPagar(null)} disabled={isPaying}>
              Cancelar
            </Button>
            <Button variant="success" onClick={handlePagar} disabled={isPaying}>
              {isPaying ? 'Registrando...' : 'Registrar pago'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};