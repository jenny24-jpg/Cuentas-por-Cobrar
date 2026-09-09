import React, { useEffect, useState } from 'react';
import { TextInput, Select, TextArea, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { CatalogoOption, Ruta } from '@erp/contracts';

// NOTA: igual que en GestionCobroForm (módulo cobranza), no se importa el
// enum de estados desde @erp/contracts aquí a propósito. Vite/Rollup no
// resuelve estáticamente constantes de runtime detrás de 3+ niveles de
// `export *` encadenados. El backend SÍ valida contra la constante real en
// packages/contracts/src/modules/cxc/organizacion/ruta.ts. Si cambian los
// valores allá, cámbialos aquí también.
const ESTADOS_RUTA = ['PLANIFICADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'] as const;
const ESTADO_OPTIONS = ESTADOS_RUTA.map((e) => ({ value: e, label: e.replace('_', ' ') }));

interface RutaFormProps {
  ruta?: Ruta | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const RutaForm = ({ ruta, onSuccess, onCancel }: RutaFormProps) => {
  const isEditing = !!ruta;

  const [empleados, setEmpleados] = useState<CatalogoOption[]>([]);

  const [codigoRuta, setCodigoRuta] = useState(ruta?.codigoRuta ?? '');
  const [nombre, setNombre] = useState(ruta?.nombre ?? '');
  const [idEmpleado, setIdEmpleado] = useState(ruta?.idEmpleado?.toString() ?? '');
  const [fecha, setFecha] = useState(ruta?.fecha?.slice(0, 10) ?? '');
  const [estado, setEstado] = useState(ruta?.estado ?? 'PLANIFICADA');
  const [observaciones, setObservaciones] = useState(ruta?.observaciones ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    // Reutiliza el catálogo de empleados que ya expone el módulo de cobranza.
    apiClient.get<CatalogoOption[]>('/cxc/catalogos/empleados').then(setEmpleados).catch(() => setEmpleados([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      codigoRuta: codigoRuta || undefined,
      nombre,
      idEmpleado: Number(idEmpleado),
      fecha: fecha || undefined,
      estado,
      observaciones: observaciones || undefined,
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/rutas/${ruta!.idRuta}`, payload);
      } else {
        await apiClient.post('/cxc/rutas', payload);
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
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar la ruta');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Código de ruta"
          value={codigoRuta}
          onChange={(e) => setCodigoRuta(e.target.value)}
          error={errors.codigoRuta}
          placeholder="Opcional. Ej. RT-001"
        />
        <TextInput
          label="Nombre"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          error={errors.nombre}
          placeholder="Ej. Ruta Zona 9 - Miércoles"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Empleado responsable"
          required
          value={idEmpleado}
          onChange={(e) => setIdEmpleado(e.target.value)}
          options={empleados.map((e) => ({ value: e.id, label: e.label }))}
          error={errors.idEmpleado}
        />
        <TextInput
          label="Fecha"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          error={errors.fecha}
        />
      </div>

      <Select
        label="Estado"
        required
        value={estado}
        onChange={(e) => setEstado(e.target.value)}
        options={ESTADO_OPTIONS}
      />

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
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear ruta'}
        </Button>
      </div>
    </form>
  );
};
