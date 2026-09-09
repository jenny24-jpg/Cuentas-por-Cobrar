import React, { useEffect, useState } from 'react';
import { TextInput, Select, TextArea, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  validateRequiredSelect,
  validateRequiredDate,
  validateDate,
  validateNumber,
  validateMaxLength,
  hasErrors,
  type ValidationErrors,
} from '../../../../shared/validation';
import type { CatalogoOption, PromesaPago } from '@erp/contracts';

interface PromesaPagoFormProps {
  promesa?: PromesaPago | null;
  onSuccess: () => void;
  onCancel: () => void;
}

// Ver nota en GestionCobroForm.tsx sobre por qué esta constante se define
// localmente en vez de importarse desde @erp/contracts.
const ESTADOS_PROMESA_PAGO = ['PENDIENTE', 'CUMPLIDA', 'INCUMPLIDA'] as const;
const ESTADO_OPTIONS = ESTADOS_PROMESA_PAGO.map((e) => ({ value: e, label: e }));

export const PromesaPagoForm = ({ promesa, onSuccess, onCancel }: PromesaPagoFormProps) => {
  const isEditing = !!promesa;

  const [clientes, setClientes] = useState<CatalogoOption[]>([]);
  const [documentos, setDocumentos] = useState<CatalogoOption[]>([]);

  const [idCliente, setIdCliente] = useState(promesa?.idCliente?.toString() ?? '');
  const [idDocumento, setIdDocumento] = useState(promesa?.idDocumento?.toString() ?? '');
  const [fechaPromesa, setFechaPromesa] = useState(promesa?.fechaPromesa?.slice(0, 10) ?? '');
  const [fechaCompromiso, setFechaCompromiso] = useState(promesa?.fechaCompromiso?.slice(0, 10) ?? '');
  const [montoComprometido, setMontoComprometido] = useState(promesa?.montoComprometido?.toString() ?? '');
  const [estado, setEstado] = useState(promesa?.estado ?? 'PENDIENTE');
  const [observaciones, setObservaciones] = useState(promesa?.observaciones ?? '');

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<CatalogoOption[]>('/cxc/catalogos/clientes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    if (!idCliente) { setDocumentos([]); return; }
    apiClient
      .get<CatalogoOption[]>(`/cxc/catalogos/clientes/${idCliente}/documentos-pendientes`)
      .then(setDocumentos)
      .catch(() => setDocumentos([]));
  }, [idCliente]);

  const validate = (): ValidationErrors => {
    const next: ValidationErrors = {};

    const clienteErr = validateRequiredSelect(idCliente, 'un cliente');
    if (clienteErr) next.idCliente = clienteErr;

    // La fecha de la promesa es obligatoria y no puede ser futura (es
    // cuando el cliente PROMETIÓ pagar, se registra al momento o después).
    const fechaPromesaErr = validateRequiredDate(fechaPromesa, 'La fecha de la promesa', { notFuture: true });
    if (fechaPromesaErr) next.fechaPromesa = fechaPromesaErr;

    // La fecha de compromiso (cuándo va a pagar de verdad) sí puede ser
    // futura, pero nunca anterior a la fecha en que se hizo la promesa.
    const fechaCompromisoErr = validateDate(fechaCompromiso, 'La fecha comprometida de pago', {
      notBefore: fechaPromesa ? { date: fechaPromesa, label: 'la fecha de la promesa' } : undefined,
    });
    if (fechaCompromisoErr) next.fechaCompromiso = fechaCompromisoErr;

    const montoErr = validateNumber(montoComprometido, 'El monto comprometido', { positive: true });
    if (!montoComprometido || montoComprometido.trim() === '') {
      next.montoComprometido = 'El monto comprometido es obligatorio.';
    } else if (montoErr) {
      next.montoComprometido = montoErr;
    }

    const obsErr = validateMaxLength(observaciones, 'Observaciones', 500);
    if (obsErr) next.observaciones = obsErr;

    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validationErrors = validate();
    if (hasErrors(validationErrors)) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    const payload = {
      idCliente: Number(idCliente),
      idDocumento: idDocumento ? Number(idDocumento) : undefined,
      fechaPromesa,
      fechaCompromiso: fechaCompromiso || undefined,
      montoComprometido: Number(montoComprometido),
      estado,
      observaciones: observaciones || undefined,
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/promesas-pago/${promesa!.idPromesa}`, payload);
      } else {
        await apiClient.post('/cxc/promesas-pago', payload);
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {};
        (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => { fieldErrors[d.campo] = d.mensaje; });
        setErrors(fieldErrors);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar la promesa de pago');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Select
        label="Cliente"
        required
        value={idCliente}
        onChange={(e: any) => { setIdCliente(e.target.value); setIdDocumento(''); }}
        options={clientes.map((c) => ({ value: c.id, label: c.label }))}
        error={errors.idCliente}
        helperText="El cliente que hizo la promesa de pago."
      />

      <Select
        label="Documento relacionado"
        value={idDocumento}
        onChange={(e: any) => setIdDocumento(e.target.value)}
        options={documentos.map((d) => ({ value: d.id, label: d.label }))}
        placeholder={idCliente ? 'Seleccionar documento (opcional)' : 'Selecciona un cliente primero'}
        isReadOnly={!idCliente}
        helperText="Opcional: la factura o documento específico al que aplica esta promesa."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha de la promesa"
          type="date"
          required
          value={fechaPromesa}
          onChange={(e: any) => setFechaPromesa(e.target.value)}
          error={errors.fechaPromesa}
          helperText="El día en que el cliente se comprometió (no puede ser futura)."
        />
        <TextInput
          label="Fecha comprometida de pago"
          type="date"
          value={fechaCompromiso}
          onChange={(e: any) => setFechaCompromiso(e.target.value)}
          error={errors.fechaCompromiso}
          helperText="Cuándo dijo que va a pagar. Debe ser igual o posterior a la fecha de la promesa."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Monto comprometido"
          type="number"
          step="0.01"
          required
          value={montoComprometido}
          onChange={(e: any) => setMontoComprometido(e.target.value)}
          error={errors.montoComprometido}
          helperText="Cantidad exacta que el cliente prometió pagar."
        />
        <Select
          label="Estado"
          value={estado}
          onChange={(e: any) => setEstado(e.target.value)}
          options={ESTADO_OPTIONS}
          helperText="Actualízalo a Cumplida o Incumplida cuando se sepa el resultado."
        />
      </div>

      <TextArea
        label="Observaciones"
        value={observaciones}
        onChange={(e: any) => setObservaciones(e.target.value)}
        rows={3}
        error={errors.observaciones}
        helperText="Detalle adicional (máx. 500 caracteres)."
      />

      {formError && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear promesa'}
        </Button>
      </div>
    </form>
  );
};