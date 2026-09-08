import React, { useEffect, useState } from 'react';
import { TextInput, Select, TextArea, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { CatalogoOption, ConvenioPago } from '@erp/contracts';

// Ver nota en GestionCobroForm.tsx sobre por qué esta constante se define
// localmente en vez de importarse desde @erp/contracts.
const ESTADOS_CONVENIO_PAGO = ['ACTIVO', 'CUMPLIDO', 'INCUMPLIDO', 'CANCELADO'] as const;

interface ConvenioPagoFormProps {
  convenio?: ConvenioPago | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const ESTADO_OPTIONS = ESTADOS_CONVENIO_PAGO.map((e) => ({ value: e, label: e }));

export const ConvenioPagoForm = ({ convenio, onSuccess, onCancel }: ConvenioPagoFormProps) => {
  const isEditing = !!convenio;

  const [clientes, setClientes] = useState<CatalogoOption[]>([]);
  const [idCliente, setIdCliente] = useState(convenio?.idCliente?.toString() ?? '');
  const [fechaConvenio, setFechaConvenio] = useState(convenio?.fechaConvenio?.slice(0, 10) ?? '');
  const [montoDeuda, setMontoDeuda] = useState(convenio?.montoDeuda?.toString() ?? '');
  const [numeroCuotas, setNumeroCuotas] = useState(convenio?.numeroCuotas?.toString() ?? '');
  const [estado, setEstado] = useState(convenio?.estado ?? 'ACTIVO');
  const [observaciones, setObservaciones] = useState(convenio?.observaciones ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<CatalogoOption[]>('/cxc/catalogos/clientes').then(setClientes).catch(() => setClientes([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (isEditing) {
        // Al editar, solo se permite cambiar estado/observaciones (ver nota
        // en el repositorio del servidor: cambiar monto/cuotas desincroniza
        // el plan de cuotas ya generado).
        await apiClient.patch(`/cxc/convenios-pago/${convenio!.idConvenio}`, { estado, observaciones: observaciones || undefined });
      } else {
        await apiClient.post('/cxc/convenios-pago', {
          idCliente: Number(idCliente),
          fechaConvenio,
          montoDeuda: Number(montoDeuda),
          numeroCuotas: Number(numeroCuotas),
          estado,
          observaciones: observaciones || undefined,
        });
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => { fieldErrors[d.campo] = d.mensaje; });
        setErrors(fieldErrors);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el convenio');
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
        onChange={(e: any) => setIdCliente(e.target.value)}
        options={clientes.map((c) => ({ value: c.id, label: c.label }))}
        error={errors.idCliente}
        isReadOnly={isEditing}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha del convenio"
          type="date"
          required
          value={fechaConvenio}
          onChange={(e: any) => setFechaConvenio(e.target.value)}
          error={errors.fechaConvenio}
          isReadOnly={isEditing}
        />
        <TextInput
          label="Monto de la deuda"
          type="number"
          step="0.01"
          required
          value={montoDeuda}
          onChange={(e: any) => setMontoDeuda(e.target.value)}
          error={errors.montoDeuda}
          isReadOnly={isEditing}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Número de cuotas"
          type="number"
          required
          value={numeroCuotas}
          onChange={(e: any) => setNumeroCuotas(e.target.value)}
          error={errors.numeroCuotas}
          isReadOnly={isEditing}
          helperText={!isEditing ? 'Las cuotas se generan automáticamente al crear el convenio' : undefined}
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
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear convenio'}
        </Button>
      </div>
    </form>
  );
};
