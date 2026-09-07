import React, { useState } from 'react';
import { TextInput, Select, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { TipoDocumento } from '@erp/contracts';

interface Props {
  tipo?: TipoDocumento | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const TipoDocumentoForm = ({ tipo, onSuccess, onCancel }: Props) => {
  const isEditing = !!tipo;
  const [codigo, setCodigo] = useState(tipo?.codigo ?? '');
  const [nombre, setNombre] = useState(tipo?.nombre ?? '');
  const [naturaleza, setNaturaleza] = useState(tipo?.naturaleza ?? '');
  const [estado, setEstado] = useState(tipo?.estado ?? 'A');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      codigo,
      nombre,
      naturaleza: naturaleza || undefined,
      estado,
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/tipos-documento/${tipo!.idTipoDocumento}`, payload);
      } else {
        await apiClient.post('/cxc/tipos-documento', payload);
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
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el tipo de documento');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Código"
          required
          value={codigo}
          onChange={(e: any) => setCodigo(e.target.value)}
          error={errors.codigo}
        />
        <Select
          label="Estado"
          required
          value={estado}
          onChange={(e: any) => setEstado(e.target.value)}
          options={[
            { value: 'A', label: 'Activo' },
            { value: 'I', label: 'Inactivo' },
          ]}
        />
      </div>

      <TextInput
        label="Nombre"
        required
        value={nombre}
        onChange={(e: any) => setNombre(e.target.value)}
        error={errors.nombre}
      />

      <TextInput
        label="Naturaleza"
        value={naturaleza}
        onChange={(e: any) => setNaturaleza(e.target.value)}
        placeholder="Ej. CARGO, CREDITO"
        error={errors.naturaleza}
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
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear tipo'}
        </Button>
      </div>
    </form>
  );
};
