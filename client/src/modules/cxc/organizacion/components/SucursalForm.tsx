import React, { useEffect, useState } from 'react';
import { TextInput, Select, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { CatalogoOption, Sucursal } from '@erp/contracts';

const ESTADOS_SUCURSAL = [
  { value: 'A', label: 'Activa' },
  { value: 'I', label: 'Inactiva' },
];

interface SucursalFormProps {
  sucursal?: Sucursal | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const SucursalForm = ({ sucursal, onSuccess, onCancel }: SucursalFormProps) => {
  const isEditing = !!sucursal;

  const [empresas, setEmpresas] = useState<CatalogoOption[]>([]);

  const [idEmpresa, setIdEmpresa] = useState(sucursal?.idEmpresa?.toString() ?? '');
  const [nombre, setNombre] = useState(sucursal?.nombre ?? '');
  const [direccion, setDireccion] = useState(sucursal?.direccion ?? '');
  const [estado, setEstado] = useState(sucursal?.estado ?? 'A');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<CatalogoOption[]>('/cxc/empresas/options').then(setEmpresas).catch(() => setEmpresas([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      idEmpresa: Number(idEmpresa),
      nombre,
      direccion: direccion || undefined,
      estado,
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/sucursales/${sucursal!.idSucursal}`, payload);
      } else {
        await apiClient.post('/cxc/sucursales', payload);
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
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar la sucursal');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Select
        label="Empresa"
        required
        value={idEmpresa}
        onChange={(e) => setIdEmpresa(e.target.value)}
        options={empresas.map((e) => ({ value: e.id, label: e.label }))}
        error={errors.idEmpresa}
      />

      <TextInput
        label="Nombre de la sucursal"
        required
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        error={errors.nombre}
        placeholder="Ej. Sucursal Zona 9"
      />

      <TextInput
        label="Dirección"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
        error={errors.direccion}
        placeholder="Opcional"
      />

      <Select
        label="Estado"
        required
        value={estado}
        onChange={(e) => setEstado(e.target.value)}
        options={ESTADOS_SUCURSAL}
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
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear sucursal'}
        </Button>
      </div>
    </form>
  );
};
