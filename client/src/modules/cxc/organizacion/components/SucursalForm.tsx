import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  hasErrors,
  sanitizeSoloLetras,
  validateMaxLength,
  validateRequired,
  validateRequiredSelect,
  validateSoloLetras,
  type ValidationErrors,
} from '../../../../shared/validation';
import type { CatalogoOption, Sucursal } from '@erp/contracts';
import { RutaMap } from './RutaMap';
import { BuscadorDireccion } from './BuscadorDireccion';

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
  const isEditing = Boolean(sucursal);
  const [empresas, setEmpresas] = useState<CatalogoOption[]>([]);
  const [idEmpresa, setIdEmpresa] = useState(sucursal?.idEmpresa?.toString() ?? '');
  const [nombre, setNombre] = useState(sucursal?.nombre ?? '');
  const [direccion, setDireccion] = useState(sucursal?.direccion ?? '');
  const [latitud, setLatitud] = useState(sucursal?.latitud != null ? String(sucursal.latitud) : '');
  const [longitud, setLongitud] = useState(sucursal?.longitud != null ? String(sucursal.longitud) : '');
  const [estado, setEstado] = useState(sucursal?.estado ?? 'A');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<CatalogoOption[]>('/cxc/empresas/options').then(setEmpresas).catch(() => setEmpresas([]));
  }, []);

  const pick = latitud !== '' && longitud !== '' ? { lat: Number(latitud), lon: Number(longitud) } : null;
  const fijarPunto = (lat: number, lon: number) => { setLatitud(lat.toFixed(6)); setLongitud(lon.toFixed(6)); };

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};
    const empresaErr = validateRequiredSelect(idEmpresa, 'una empresa');
    if (empresaErr) next.idEmpresa = empresaErr;
    const nombreErr = validateRequired(nombre, 'El nombre de la sucursal');
    if (nombreErr) next.nombre = nombreErr;
    const nombreMax = validateMaxLength(nombre, 'El nombre de la sucursal', 150);
    if (nombreMax) next.nombre = nombreMax;
    const nombreLetras = validateSoloLetras(nombre, 'El nombre de la sucursal');
    if (nombreLetras) next.nombre = nombreLetras;
    const dirMax = validateMaxLength(direccion, 'La dirección', 200);
    if (dirMax) next.direccion = dirMax;
    return next;
  }, [idEmpresa, nombre, direccion]);

  const isFormValid = !hasErrors(validationErrors);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!isFormValid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    const payload = {
      idEmpresa: Number(idEmpresa),
      nombre: nombre.trim(),
      direccion: direccion.trim() || undefined,
      latitud: latitud ? Number(latitud) : null,
      longitud: longitud ? Number(longitud) : null,
      estado,
    };

    try {
      if (isEditing) await apiClient.patch(`/cxc/sucursales/${sucursal!.idSucursal}`, payload);
      else await apiClient.post('/cxc/sucursales', payload);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {};
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <Select
          label="Empresa"
          required
          value={idEmpresa}
          onChange={(e: any) => setIdEmpresa(e.target.value)}
          options={empresas.map((e) => ({ value: e.id, label: e.label }))}
          helperText="Empresa propietaria de la sucursal."
          error={errors.idEmpresa}
        />

        <TextInput
          label="Nombre de la sucursal"
          required
          maxLength={150}
          value={nombre}
          onChange={(e: any) => setNombre(sanitizeSoloLetras(e.target.value))}
          error={errors.nombre ?? (nombre ? validationErrors.nombre : undefined)}
          helperText="Solo letras y espacios; máximo 150."
          placeholder="Ej. Sucursal Centro"
        />

        <TextInput
          label="Dirección"
          maxLength={200}
          value={direccion}
          onChange={(e: any) => setDireccion(e.target.value)}
          error={errors.direccion ?? (direccion ? validationErrors.direccion : undefined)}
          helperText="Dirección física; máximo 200."
          placeholder="Opcional"
        />

        <div className="sm:col-span-2 flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-700">Ubicación en el mapa <span className="font-normal text-slate-400">(opcional)</span></p>
          <p className="text-xs text-slate-500">
            Escribe la dirección arriba y pulsa «Buscar», o haz clic en el mapa para fijar el punto. Sirve para sugerir la sucursal más cercana a una ruta.
          </p>
          <BuscadorDireccion texto={direccion} onSeleccionar={(r) => fijarPunto(r.lat, r.lon)} />
          <RutaMap heightClass="h-56" pick={pick} onPick={fijarPunto} />
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>{pick ? `Ubicación fijada: ${pick.lat.toFixed(6)}, ${pick.lon.toFixed(6)}` : 'Sin ubicación fijada.'}</span>
            {pick && (
              <button type="button" onClick={() => { setLatitud(''); setLongitud(''); }}
                className="font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                Quitar ubicación
              </button>
            )}
          </div>
        </div>

        <Select
          label="Estado"
          required
          value={estado}
          onChange={(e: any) => setEstado(e.target.value)}
          options={ESTADOS_SUCURSAL}
          helperText="Las inactivas no se usan en procesos nuevos."
        />
      </div>

      {formError && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <FormActionButtons
        onCancel={onCancel}
        isSubmitting={isSubmitting}
        isEditing={isEditing}
        isFormValid={isFormValid} blockers={validationErrors}
        createLabel="Crear sucursal"
      />
    </form>
  );
};