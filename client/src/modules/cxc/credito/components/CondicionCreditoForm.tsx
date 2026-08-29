import React, { useState } from 'react';
import { TextInput, Select, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { CondicionCredito } from '@erp/contracts';

interface CondicionCreditoFormProps {
  condicion?: CondicionCredito | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const ESTADO_OPTIONS = [
  { value: 'A', label: 'Activo' },
  { value: 'I', label: 'Inactivo' },
];

export const CondicionCreditoForm = ({
  condicion,
  onSuccess,
  onCancel,
}: CondicionCreditoFormProps) => {
  const isEditing = !!condicion;

  const [diasCredito, setDiasCredito] = useState(
    condicion?.diasCredito?.toString() ?? '',
  );

  const [porcentajeMora, setPorcentajeMora] = useState(
    condicion?.porcentajeMora?.toString() ?? '',
  );

  const [diasGracia, setDiasGracia] = useState(
    condicion?.diasGracia?.toString() ?? '',
  );

  const [estado, setEstado] = useState(condicion?.estado ?? 'A');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      diasCredito: Number(diasCredito),
      porcentajeMora: Number(porcentajeMora),
      diasGracia: Number(diasGracia),
      estado: estado as 'A' | 'I',
    };

    try {
      if (isEditing) {
        await apiClient.patch(
          `/cxc/condiciones-credito/${condicion!.idCondicion}`,
          payload,
        );
      } else {
        await apiClient.post('/cxc/condiciones-credito', payload);
      }

      onSuccess();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 400 &&
        Array.isArray(err.details)
      ) {
        const fieldErrors: Record<string, string> = {};

        (
          err.details as Array<{
            campo: string;
            mensaje: string;
          }>
        ).forEach((detail) => {
          fieldErrors[detail.campo] = detail.mensaje;
        });

        setErrors(fieldErrors);
      } else {
        setFormError(
          err instanceof ApiError
            ? err.message
            : 'No se pudo guardar la condición de crédito',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Días de crédito"
          type="number"
          required
          min="0"
          value={diasCredito}
          onChange={(e) => setDiasCredito(e.target.value)}
          error={errors.diasCredito}
          placeholder="Ej. 30"
        />

        <TextInput
          label="Porcentaje de mora"
          type="number"
          step="0.01"
          min="0"
          required
          value={porcentajeMora}
          onChange={(e) => setPorcentajeMora(e.target.value)}
          error={errors.porcentajeMora}
          placeholder="Ej. 2.5"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Días de gracia"
          type="number"
          min="0"
          required
          value={diasGracia}
          onChange={(e) => setDiasGracia(e.target.value)}
          error={errors.diasGracia}
          placeholder="Ej. 5"
        />

        <Select
          label="Estado"
          required
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          options={ESTADO_OPTIONS}
          error={errors.estado}
        />
      </div>

      {formError && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Guardando...'
            : isEditing
              ? 'Guardar cambios'
              : 'Crear condición'}
        </Button>
      </div>
    </form>
  );
};