import React, { useEffect, useState } from 'react';
import { TextInput, Select, TextArea, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { CatalogoOption, RutaDetalle } from '@erp/contracts';

// Ver misma nota de ESTADOS_RUTA en RutaForm.tsx sobre por qué no se importa
// el enum directo desde @erp/contracts.
const ESTADOS_VISITA = ['PENDIENTE', 'VISITADO', 'NO_ENCONTRADO', 'REPROGRAMADO'] as const;
const ESTADO_OPTIONS = ESTADOS_VISITA.map((e) => ({ value: e, label: e.replace('_', ' ') }));

interface RutaDetalleFormProps {
  idRuta: number;
  parada?: RutaDetalle | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const RutaDetalleForm = ({ idRuta, parada, onSuccess, onCancel }: RutaDetalleFormProps) => {
  const isEditing = !!parada;

  const [clientes, setClientes] = useState<CatalogoOption[]>([]);

  const [idCliente, setIdCliente] = useState(parada?.idCliente?.toString() ?? '');
  const [ordenVisita, setOrdenVisita] = useState(parada?.ordenVisita?.toString() ?? '');
  const [direccion, setDireccion] = useState(parada?.direccion ?? '');
  const [montoPendiente, setMontoPendiente] = useState(parada?.montoPendiente?.toString() ?? '');
  const [estadoVisita, setEstadoVisita] = useState(parada?.estadoVisita ?? 'PENDIENTE');
  const [horaVisita, setHoraVisita] = useState(parada?.horaVisita ?? '');
  const [observaciones, setObservaciones] = useState(parada?.observaciones ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    // Reutiliza el catálogo de clientes que ya expone el módulo de cobranza.
    apiClient.get<CatalogoOption[]>('/cxc/catalogos/clientes').then(setClientes).catch(() => setClientes([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      idCliente: Number(idCliente),
      ordenVisita: ordenVisita ? Number(ordenVisita) : undefined,
      direccion: direccion || undefined,
      montoPendiente: montoPendiente ? Number(montoPendiente) : undefined,
      estadoVisita: estadoVisita || undefined,
      horaVisita: horaVisita || undefined,
      observaciones: observaciones || undefined,
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/rutas/detalle/${parada!.idRutaDetalle}`, payload);
      } else {
        await apiClient.post(`/cxc/rutas/${idRuta}/detalle`, payload);
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
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar la parada');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Cliente"
          required
          value={idCliente}
          onChange={(e) => setIdCliente(e.target.value)}
          options={clientes.map((c) => ({ value: c.id, label: c.label }))}
          error={errors.idCliente}
        />
        <TextInput
          label="Orden de visita"
          type="number"
          value={ordenVisita}
          onChange={(e) => setOrdenVisita(e.target.value)}
          error={errors.ordenVisita}
          placeholder="Ej. 1"
        />
      </div>

      <TextInput
        label="Dirección"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
        error={errors.direccion}
        placeholder="Opcional"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TextInput
          label="Hora de visita"
          value={horaVisita}
          onChange={(e) => setHoraVisita(e.target.value)}
          error={errors.horaVisita}
          placeholder="Ej. 09:00"
        />
        <TextInput
          label="Monto pendiente"
          type="number"
          step="0.01"
          value={montoPendiente}
          onChange={(e) => setMontoPendiente(e.target.value)}
          error={errors.montoPendiente}
        />
        <Select
          label="Estado de visita"
          value={estadoVisita}
          onChange={(e) => setEstadoVisita(e.target.value)}
          options={ESTADO_OPTIONS}
        />
      </div>

      <TextArea
        label="Observaciones"
        value={observaciones}
        onChange={(e) => setObservaciones(e.target.value)}
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
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Agregar parada'}
        </Button>
      </div>
    </form>
  );
};
