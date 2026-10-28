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
import type { FormaPago } from '@erp/contracts';

export function FormaPagoForm({
  item,
  onSuccess,
  onCancel,
}: {
  item?: FormaPago | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(item);
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [requiereReferencia, setReq] = useState(item?.requiereReferencia ?? 'N');
  const [estado, setEstado] = useState(item?.estado ?? 'A');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};
    const requiredErr = validateRequired(nombre, 'El nombre');
    if (requiredErr) next.nombre = requiredErr;
    const maxErr = validateMaxLength(nombre, 'El nombre', 80);
    if (maxErr) next.nombre = maxErr;
    return next;
  }, [nombre]);

  const isFormValid = !hasErrors(validationErrors);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!isFormValid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setBusy(true);
    const payload = { nombre: nombre.trim(), requiereReferencia, estado };

    try {
      if (isEditing) await apiClient.patch(`/cxc/formas-pago/${item!.idFormaPago}`, payload);
      else await apiClient.post('/cxc/formas-pago', payload);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const x: ValidationErrors = {};
        (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => { x[d.campo] = d.mensaje; });
        setErrors(x);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar la forma de pago');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <TextInput
          label="Nombre"
          required
          restriction="letters"
          maxLength={80}
          helperText="Solo letras y espacios; máximo 80."
          value={nombre}
          onChange={(e: any) => setNombre(e.target.value)}
          error={errors.nombre ?? (nombre ? validationErrors.nombre : undefined)}
        />
        <Select
          label="Requiere referencia"
          required
          value={requiereReferencia}
          onChange={(e: any) => setReq(e.target.value)}
          options={[
            { value: 'S', label: 'Sí' },
            { value: 'N', label: 'No' },
          ]}
          helperText="Si el número de operación o cheque será obligatorio."
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
          helperText="Solo las activas aparecen en los formularios."
        />
      </div>

      {formError && <p className="text-sm text-red-600 font-medium">{formError}</p>}

      <FormActionButtons
        onCancel={onCancel}
        isSubmitting={busy}
        isEditing={isEditing}
        isFormValid={isFormValid} blockers={validationErrors}
        createLabel="Guardar forma"
      />
    </form>
  );
}
