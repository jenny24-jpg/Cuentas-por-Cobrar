import React, { useEffect, useState } from 'react';
import { TextInput, Select, TextArea, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { CatalogoOption, PromesaPago } from '@erp/contracts';

// Ver nota en GestionCobroForm.tsx sobre por qué esta constante se define
// localmente en vez de importarse desde @erp/contracts.
const ESTADOS_PROMESA_PAGO = ['PENDIENTE', 'CUMPLIDA', 'INCUMPLIDA'] as const;

interface PromesaPagoFormProps {
  promesa?: PromesaPago | null;
  onSuccess: () => void;
  onCancel: () => void;
}

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

  const [errors, setErrors] = useState<Record<string, string>>({});
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
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
        const fieldErrors: Record<string, string> = {};
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
      />

      <Select
        label="Documento relacionado"
        value={idDocumento}
        onChange={(e: any) => setIdDocumento(e.target.value)}
        options={documentos.map((d) => ({ value: d.id, label: d.label }))}
        placeholder={idCliente ? 'Seleccionar documento (opcional)' : 'Selecciona un cliente primero'}
        isReadOnly={!idCliente}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha de la promesa"
          type="date"
          required
          value={fechaPromesa}
          onChange={(e: any) => setFechaPromesa(e.target.value)}
          error={errors.fechaPromesa}
        />
        <TextInput
          label="Fecha comprometida de pago"
          type="date"
          value={fechaCompromiso}
          onChange={(e: any) => setFechaCompromiso(e.target.value)}
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
        />
        <Select
          label="Estado"
          value={estado}
          onChange={(e: any) => setEstado(e.target.value)}
          options={ESTADO_OPTIONS}
        />
      </div>

      <TextArea
        label="Observaciones"
        value={observaciones}
        onChange={(e: any) => setObservaciones(e.target.value)}
        rows={3}
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
