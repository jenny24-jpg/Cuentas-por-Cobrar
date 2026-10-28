import React, { useMemo, useState } from 'react';
import { TextInput, Select } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import { hasErrors, type ValidationErrors } from '../../../../shared/validation';
import { FORMAS_PAGO_ESTANDAR, type FormaPago } from '@erp/contracts';

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
  const [estado, setEstado] = useState(item?.estado ?? 'A');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const estandar = FORMAS_PAGO_ESTANDAR.find((f) => f.nombre === nombre);
  const requiereReferencia = estandar?.requiereReferencia ?? item?.requiereReferencia ?? 'N';

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};
    if (!isEditing && !nombre) next.nombre = 'Selecciona una forma de pago del catálogo estándar.';
    return next;
  }, [nombre, isEditing]);

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
    // Al editar solo cambia el estado; el nombre identifica la forma estándar.
    const payload = isEditing ? { estado } : { nombre, estado };

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
        {isEditing ? (
          <TextInput
            label="Forma de pago"
            value={nombre}
            isReadOnly
            helperText="Forma estándar; solo puede activarse o inactivarse."
          />
        ) : (
          <Select
            label="Forma de pago"
            required
            value={nombre}
            onChange={(e: any) => setNombre(e.target.value)}
            options={[{ value: '', label: 'Selecciona...' }, ...FORMAS_PAGO_ESTANDAR.map((f) => ({ value: f.nombre, label: f.nombre }))]}
            helperText="Catálogo estándar; no se escriben nombres libres."
            error={errors.nombre}
          />
        )}
        <TextInput
          label="Requiere referencia"
          value={requiereReferencia === 'S' ? 'Sí' : 'No'}
          isReadOnly
          helperText="Lo define la forma de pago (efectivo no; bancos, cheque y tarjeta sí)."
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
