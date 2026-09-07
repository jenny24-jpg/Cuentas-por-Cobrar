import React, { useState } from 'react';
import { TextInput, TextArea, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { DocumentoDetalle } from '@erp/contracts';

interface Props {
  idDocumento: number;
  detalle?: DocumentoDetalle | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const DocumentoDetalleForm = ({ idDocumento, detalle, onSuccess, onCancel }: Props) => {
  const isEditing = !!detalle;
  const [codigoProducto, setCodigoProducto] = useState(detalle?.codigoProducto ?? '');
  const [descripcion, setDescripcion] = useState(detalle?.descripcion ?? '');
  const [cantidad, setCantidad] = useState(detalle?.cantidad?.toString() ?? '');
  const [precioUnitario, setPrecioUnitario] = useState(detalle?.precioUnitario?.toString() ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      codigoProducto: codigoProducto || undefined,
      descripcion,
      cantidad: Number(cantidad),
      precioUnitario: Number(precioUnitario),
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/documentos/detalles/${detalle!.idDetalle}`, payload);
      } else {
        await apiClient.post(`/cxc/documentos/${idDocumento}/detalles`, payload);
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
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el detalle');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextInput
        label="Código de producto"
        value={codigoProducto}
        onChange={(e: any) => setCodigoProducto(e.target.value)}
      />
      <TextArea
        label="Descripción"
        required
        value={descripcion}
        onChange={(e: any) => setDescripcion(e.target.value)}
        rows={3}
        error={errors.descripcion}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Cantidad"
          type="number"
          step="0.01"
          required
          value={cantidad}
          onChange={(e: any) => setCantidad(e.target.value)}
          error={errors.cantidad}
        />
        <TextInput
          label="Precio unitario"
          type="number"
          step="0.01"
          required
          value={precioUnitario}
          onChange={(e: any) => setPrecioUnitario(e.target.value)}
          error={errors.precioUnitario}
        />
      </div>

      {formError && <p className="text-sm text-red-600 font-medium">{formError}</p>}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Agregar detalle'}
        </Button>
      </div>
    </form>
  );
};
