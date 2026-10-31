import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  hasErrors,
  sanitizeSoloLetras,
  validateGuatemalaNit,
  validateMaxLength,
  validateRequired,
  validateSoloLetras,
  type ValidationErrors,
} from '../../../../shared/validation';
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
  const isEditing = Boolean(empresa);
  const [nombre, setNombre] = useState(empresa?.nombre ?? '');
  const [nit, setNit] = useState(empresa?.nit ?? '');
  const [direccion, setDireccion] = useState(empresa?.direccion ?? '');
  const [giroComercial, setGiroComercial] = useState(empresa?.giroComercial?.trim() ?? '');
  const [estado, setEstado] = useState(empresa?.estado ?? 'A');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Tipos de comercio registrados en la base; si no hay, el DBA debe cargarlos.
  const [tiposComercio, setTiposComercio] = useState<string[] | null>(null);

  useEffect(() => {
    apiClient.get<string[]>('/cxc/empresas/tipos-comercio')
      .then(setTiposComercio)
      .catch(() => { setTiposComercio([]); setFormError('No se pudieron cargar los tipos de comercio.'); });
  }, []);
  const sinTiposComercio = tiposComercio !== null && tiposComercio.length === 0;

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};
    const nombreReq = validateRequired(nombre, 'El nombre');
    if (nombreReq) next.nombre = nombreReq;
    const nombreMax = validateMaxLength(nombre, 'El nombre', 150);
    if (nombreMax) next.nombre = nombreMax;
    const nombreLetras = validateSoloLetras(nombre, 'El nombre');
    if (nombreLetras) next.nombre = nombreLetras;
    if (nit) {
      const nitErr = validateGuatemalaNit(nit, 'El NIT');
      if (nitErr) next.nit = nitErr;
    }
    if (sinTiposComercio) next.giroComercial = 'No hay tipos de comercio en la base de datos; solicita al equipo DBA que los cargue.';
    else if (!giroComercial) next.giroComercial = 'Selecciona el tipo de comercio';
    const direccionMax = validateMaxLength(direccion, 'La dirección', 250);
    if (direccionMax) next.direccion = direccionMax;
    return next;
  }, [nombre, nit, giroComercial, direccion, sinTiposComercio]);

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
      nombre: nombre.trim(),
      nit: nit.trim().toUpperCase() || undefined,
      direccion: direccion.trim() || null,
      giroComercial,
      estado,
    };

    try {
      if (isEditing) await apiClient.patch(`/cxc/empresas/${empresa!.idEmpresa}`, payload);
      else await apiClient.post('/cxc/empresas', payload);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {};
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <TextInput
          label="Nombre"
          required
          maxLength={150}
          value={nombre}
          onChange={(e: any) => setNombre(sanitizeSoloLetras(e.target.value))}
          error={errors.nombre ?? (nombre ? validationErrors.nombre : undefined)}
          helperText="Solo letras y espacios; máximo 150."
          placeholder="Ej. Distribuidora Central"
        />
        <TextInput
          label="NIT"
          restriction="nit"
          uppercase
          maxLength={20}
          value={nit}
          onChange={(e: any) => setNit(e.target.value)}
          error={errors.nit ?? (nit ? validationErrors.nit : undefined)}
          helperText="NIT guatemalteco con dígito verificador válido, por ejemplo 1234567-9; también admite CF."
          placeholder="Ej. 1234567-9"
        />
        <Select
          label="Tipo de comercio"
          required
          value={giroComercial}
          onChange={(e: any) => setGiroComercial(e.target.value)}
          options={[{ value: '', label: tiposComercio === null ? 'Cargando...' : 'Selecciona...' }, ...(tiposComercio ?? []).map((t) => ({ value: t, label: t }))]}
          error={errors.giroComercial ?? (sinTiposComercio ? validationErrors.giroComercial : undefined)}
          helperText="Tipos registrados en la base de datos; uno nuevo lo agrega el equipo DBA."
        />
        <div className="sm:col-span-2">
          <TextInput
            label="Dirección"
            maxLength={250}
            value={direccion}
            onChange={(e: any) => setDireccion(e.target.value)}
            error={errors.direccion ?? (direccion ? validationErrors.direccion : undefined)}
            helperText="Dirección fiscal o comercial; máximo 250 caracteres."
            placeholder="Ej. 5a. avenida 10-20, zona 1, Guatemala"
          />
        </div>
        <Select
          label="Estado"
          required
          value={estado}
          onChange={(e: any) => setEstado(e.target.value)}
          options={ESTADOS_EMPRESA}
          helperText="Si la empresa está disponible en otros catálogos."
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
        createLabel="Crear empresa"
      />
    </form>
  );
};