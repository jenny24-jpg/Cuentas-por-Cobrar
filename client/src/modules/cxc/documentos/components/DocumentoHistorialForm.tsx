import React, { useEffect, useState } from 'react';
import { TextInput, Select, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { DocumentoHistorial, DocumentoCatalogoOption } from '@erp/contracts';

interface Props {
  idDocumento: number;
  historial?: DocumentoHistorial | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const DocumentoHistorialForm = ({ idDocumento, historial, onSuccess, onCancel }: Props) => {
  const isEditing = !!historial;
  const [empleados, setEmpleados] = useState<DocumentoCatalogoOption[]>([]);
  const [estadoAnterior, setEstadoAnterior] = useState(historial?.estadoAnterior ?? '');
  const [estadoNuevo, setEstadoNuevo] = useState(historial?.estadoNuevo ?? '');
  const [fecha, setFecha] = useState(historial?.fecha?.slice(0, 10) ?? '');
  const [idEmpleado, setIdEmpleado] = useState(historial?.idEmpleado?.toString() ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    apiClient
      .get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/empleados')
      .then(setEmpleados)
      .catch(() => setEmpleados([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      estadoAnterior: estadoAnterior || undefined,
      estadoNuevo,
      fecha: fecha || undefined,
      idEmpleado: Number(idEmpleado),
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/documentos/historial/${historial!.idHistorial}`, payload);
      } else {
        await apiClient.post(`/cxc/documentos/${idDocumento}/historial`, payload);
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
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el historial');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Estado anterior"
          value={estadoAnterior}
          onChange={(e: any) => setEstadoAnterior(e.target.value)}
        />
        <TextInput
          label="Estado nuevo"
          required
          value={estadoNuevo}
          onChange={(e: any) => setEstadoNuevo(e.target.value)}
          error={errors.estadoNuevo}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha"
          type="date"
          value={fecha}
          onChange={(e: any) => setFecha(e.target.value)}
        />
        <Select
          label="Empleado"
          required
          value={idEmpleado}
          onChange={(e: any) => setIdEmpleado(e.target.value)}
          options={empleados.map((e) => ({ value: e.id, label: e.label }))}
          error={errors.idEmpleado}
        />
      </div>

      {formError && <p className="text-sm text-red-600 font-medium">{formError}</p>}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Agregar historial'}
        </Button>
      </div>
    </form>
  );
};
