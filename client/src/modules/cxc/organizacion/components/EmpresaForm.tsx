import React, { useState } from 'react';
import { TextInput, Select, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { Empresa } from '@erp/contracts';

const ESTADOS_EMPRESA = [
  { value: 'A', label: 'Activa' },
  { value: 'I', label: 'Inactiva' },
];

interface EmpresaFormProps {
  empresa?: Empresa | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const EmpresaForm = ({ empresa, onSuccess, onCancel }: EmpresaFormProps) => {
  const isEditing = !!empresa;

  const [nombre, setNombre] = useState(empresa?.nombre ?? '');
  const [nit, setNit] = useState(empresa?.nit ?? '');
  const [estado, setEstado] = useState(empresa?.estado ?? 'A');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      nombre,
      nit: nit || undefined,
      estado,
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/empresas/${empresa!.idEmpresa}`, payload);
      } else {
        await apiClient.post('/cxc/empresas', payload);
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => {
          fieldErrors[d.campo] = d.mensaje;
        });
        setErrors(fieldErrors);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar la empresa');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextInput
        label="Nombre"
        required
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        error={errors.nombre}
        placeholder="Ej. Distribuidora Central, S.A."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="NIT"
          value={nit}
          onChange={(e) => setNit(e.target.value)}
          error={errors.nit}
          placeholder="Opcional"
        />
        <Select
          label="Estado"
          required
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          options={ESTADOS_EMPRESA}
        />
      </div>

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
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear empresa'}
        </Button>
      </div>
    </form>
  );
};
