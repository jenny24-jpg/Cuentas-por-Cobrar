import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select, TextArea } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import { todayIso, validateRequiredSelect, validateRequiredDate, validateMoney, validateRequiredNumber, validateMaxLength, hasErrors, type ValidationErrors } from '../../../../shared/validation';
import type { CatalogoOption, ConvenioPago } from '@erp/contracts';

interface ConvenioPagoFormProps { convenio?: ConvenioPago | null; onSuccess: () => void; onCancel: () => void; }
const ESTADOS_CONVENIO_PAGO = ['ACTIVO', 'CUMPLIDO', 'INCUMPLIDO', 'CANCELADO'] as const;
const ESTADO_OPTIONS = ESTADOS_CONVENIO_PAGO.map((e) => ({ value: e, label: e }));
const MAX_CUOTAS = 60;

export const ConvenioPagoForm = ({ convenio, onSuccess, onCancel }: ConvenioPagoFormProps) => {
  const isEditing = !!convenio;
  const [clientes, setClientes] = useState<CatalogoOption[]>([]);
  const [idCliente, setIdCliente] = useState(convenio?.idCliente?.toString() ?? '');
  const [fechaConvenio, setFechaConvenio] = useState(convenio?.fechaConvenio?.slice(0, 10) ?? '');
  const [montoDeuda, setMontoDeuda] = useState(convenio?.montoDeuda?.toString() ?? '');
  const [numeroCuotas, setNumeroCuotas] = useState(convenio?.numeroCuotas?.toString() ?? '');
  const [estado, setEstado] = useState(convenio?.estado ?? 'ACTIVO');
  const [observaciones, setObservaciones] = useState(convenio?.observaciones ?? '');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => { apiClient.get<CatalogoOption[]>('/cxc/catalogos/clientes').then(setClientes).catch(() => setClientes([])); }, []);

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};
    const clienteErr = validateRequiredSelect(idCliente, 'un cliente'); if (clienteErr) next.idCliente = clienteErr;
    const fechaErr = validateRequiredDate(fechaConvenio, 'La fecha del convenio', { notFuture: true }); if (fechaErr) next.fechaConvenio = fechaErr;
    const montoErr = validateMoney(montoDeuda, 'El monto de la deuda', { required: true, positive: true }); if (montoErr) next.montoDeuda = montoErr;
    const cuotasErr = validateRequiredNumber(numeroCuotas, 'El número de cuotas', { integer: true, min: 1, max: MAX_CUOTAS }); if (cuotasErr) next.numeroCuotas = cuotasErr;
    const obsErr = validateMaxLength(observaciones, 'Observaciones', 500); if (obsErr) next.observaciones = obsErr;
    return next;
  }, [idCliente, fechaConvenio, montoDeuda, numeroCuotas, observaciones]);
  const isFormValid = !hasErrors(validationErrors);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(null);
    if (!isFormValid) { setErrors(validationErrors); return; }
    setErrors({}); setIsSubmitting(true);
    const payload = isEditing
      ? { estado, observaciones: observaciones.trim() || undefined }
      : { idCliente: Number(idCliente), fechaConvenio, montoDeuda: Number(montoDeuda), numeroCuotas: Number(numeroCuotas), estado, observaciones: observaciones.trim() || undefined };
    try {
      if (isEditing) await apiClient.patch(`/cxc/convenios-pago/${convenio!.idConvenio}`, payload); else await apiClient.post('/cxc/convenios-pago', payload);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {}; (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => { fieldErrors[d.campo] = d.mensaje; }); setErrors(fieldErrors);
      } else setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el convenio');
    } finally { setIsSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Select label="Cliente" required value={idCliente} onChange={(e: any) => setIdCliente(e.target.value)} options={clientes.map((c) => ({ value: c.id, label: c.label }))} error={errors.idCliente} isReadOnly={isEditing} helperText={isEditing ? 'El cliente queda fijo porque el convenio ya tiene plan de cuotas.' : 'Cliente con quien se formaliza el convenio.'} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput label="Fecha del convenio" type="date" required max={todayIso()} value={fechaConvenio} onChange={(e: any) => setFechaConvenio(e.target.value)} error={errors.fechaConvenio} isReadOnly={isEditing} helperText={isEditing ? 'La fecha original no cambia al editar.' : 'Fecha real del acuerdo; no puede ser futura.'} />
        <TextInput label="Monto de la deuda" type="number" restriction="decimal" decimalPlaces={2} step="0.01" min="0.01" required value={montoDeuda} onChange={(e: any) => setMontoDeuda(e.target.value)} error={errors.montoDeuda} isReadOnly={isEditing} helperText={isEditing ? 'El monto queda fijo porque ya generó las cuotas.' : 'Monto total a distribuir; mayor a 0 y máximo 2 decimales.'} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput label="Número de cuotas" type="number" restriction="integer" min="1" max={String(MAX_CUOTAS)} step="1" required value={numeroCuotas} onChange={(e: any) => setNumeroCuotas(e.target.value)} error={errors.numeroCuotas} isReadOnly={isEditing} helperText={isEditing ? 'No se modifica porque el plan de cuotas ya existe.' : `Solo enteros entre 1 y ${MAX_CUOTAS}; las cuotas se generan automáticamente.`} />
        <Select label="Estado" required value={estado} onChange={(e: any) => setEstado(e.target.value)} options={ESTADO_OPTIONS} helperText="Estado controlado del convenio." />
      </div>
      <TextArea label="Observaciones" value={observaciones} onChange={(e: any) => setObservaciones(e.target.value)} rows={3} maxLength={500} error={errors.observaciones} helperText="Condiciones o notas adicionales del acuerdo; máximo 500 caracteres." />
      {formError && <p role="alert" className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
      <FormActionButtons onCancel={onCancel} isSubmitting={isSubmitting} isEditing={isEditing} createLabel="Crear convenio" isFormValid={isFormValid} />
    </form>
  );
};
