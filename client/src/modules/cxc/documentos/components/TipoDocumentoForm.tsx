import React, { useMemo, useState } from 'react';
import { TextInput, Select } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  hasErrors,
  validateMaxLength,
  validateRequired,
  type ValidationErrors,
} from '../../../../shared/validation';
import { CODIGO_TIPO_DOCUMENTO_MENSAJE, CODIGO_TIPO_DOCUMENTO_REGEX, type TipoDocumento } from '@erp/contracts';

interface Props {
  tipo?: TipoDocumento | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const TipoDocumentoForm = ({ tipo, onSuccess, onCancel }: Props) => {
  const isEditing = Boolean(tipo);
  const [codigo, setCodigo] = useState(tipo?.codigo ?? '');
  const [nombre, setNombre] = useState(tipo?.nombre ?? '');
  const [naturaleza, setNaturaleza] = useState(tipo?.naturaleza ?? '');
  const [estado, setEstado] = useState(tipo?.estado ?? 'A');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};
    const codigoReq = validateRequired(codigo, 'El código');
    if (codigoReq) next.codigo = codigoReq;
    else if (codigo.trim() !== tipo?.codigo.trim() && !CODIGO_TIPO_DOCUMENTO_REGEX.test(codigo.trim().toUpperCase())) {
      next.codigo = `${CODIGO_TIPO_DOCUMENTO_MENSAJE}.`;
    }

    const nombreReq = validateRequired(nombre, 'El nombre');
    if (nombreReq) next.nombre = nombreReq;
    else if (nombre.trim().length < 3) next.nombre = 'El nombre debe tener al menos 3 caracteres.';
    else if (!/^[\p{L}][\p{L}\s]*$/u.test(nombre.trim())) next.nombre = 'El nombre solo admite letras y espacios.';
    const nombreMax = validateMaxLength(nombre, 'El nombre', 80);
    if (nombreMax) next.nombre = nombreMax;

    if (!['CARGO', 'CREDITO'].includes(naturaleza)) {
      next.naturaleza = 'Selecciona la naturaleza: CARGO o CREDITO.';
    }
    return next;
  }, [codigo, nombre, naturaleza, tipo]);

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
    // Al editar, el código solo se envía si cambió: hay códigos heredados con otro formato.
    const codigoFinal = codigo.trim().toUpperCase();
    const payload = {
      ...(!isEditing || codigoFinal !== tipo!.codigo.trim() ? { codigo: codigoFinal } : {}),
      nombre: nombre.trim(),
      naturaleza,
      estado,
    };

    try {
      if (isEditing) await apiClient.patch(`/cxc/tipos-documento/${tipo!.idTipoDocumento}`, payload);
      else await apiClient.post('/cxc/tipos-documento', payload);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {};
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Código"
          required
          restriction="letters"
          uppercase
          maxLength={6}
          helperText="2 a 6 letras, único (ej. FACT). Es la serie de los documentos de este tipo."
          value={codigo}
          onChange={(e: any) => setCodigo(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())}
          error={errors.codigo ?? (codigo ? validationErrors.codigo : undefined)}
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
          helperText="Los tipos inactivos no deben mostrarse en documentos nuevos."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <TextInput
          label="Nombre"
          required
          maxLength={80}
          helperText="Solo letras y espacios, sin repetir otro tipo; máximo 80 caracteres."
          value={nombre}
          onChange={(e: any) => setNombre(e.target.value)}
          error={errors.nombre ?? (nombre ? validationErrors.nombre : undefined)}
        />

        <Select
          label="Naturaleza"
          required
          value={naturaleza}
          onChange={(e: any) => setNaturaleza(e.target.value)}
          placeholder="Seleccionar..."
          options={[
            { value: 'CARGO', label: 'Cargo' },
            { value: 'CREDITO', label: 'Crédito' },
          ]}
          helperText="Cargo aumenta la deuda; Crédito la disminuye."
          error={errors.naturaleza}
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
        createLabel="Crear tipo"
      />
    </form>
  );
};
