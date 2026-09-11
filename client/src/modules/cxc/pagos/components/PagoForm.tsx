import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  hasErrors,
  todayIso,
  validateIdentifier,
  validateMoney,
  validateRequired,
  validateRequiredDate,
  validateRequiredNumber,
  validateRequiredSelect,
  type ValidationErrors,
} from '../../../../shared/validation';
import type { CatalogoOption, FormaPagoOption, Pago } from '@erp/contracts';

const ESTADOS_PAGO = ['PENDIENTE', 'ACTIVO', 'APLICADO', 'CANCELADO'] as const;

export function PagoForm({
  pago,
  onSuccess,
  onCancel,
}: {
  pago?: Pago | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(pago);
  const [clientes, setClientes] = useState<CatalogoOption[]>([]);
  const [formas, setFormas] = useState<FormaPagoOption[]>([]);
  const [monedas, setMonedas] = useState<CatalogoOption[]>([]);

  const [idCliente, setIdCliente] = useState(pago?.idCliente?.toString() ?? '');
  const [idFormaPago, setIdFormaPago] = useState(pago?.idFormaPago?.toString() ?? '');
  const [idMoneda, setIdMoneda] = useState(pago?.idMoneda?.toString() ?? '');
  const [idBanco, setIdBanco] = useState(pago?.idBanco?.toString() ?? '');
  const [fechaPago, setFechaPago] = useState(pago?.fechaPago?.slice(0, 10) ?? '');
  const [monto, setMonto] = useState(pago?.monto?.toString() ?? '');
  const [numeroReferencia, setNumeroReferencia] = useState(pago?.numeroReferencia ?? '');
  const [estado, setEstado] = useState(pago?.estado ?? 'PENDIENTE');

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get<CatalogoOption[]>('/cxc/catalogos/clientes'),
      apiClient.get<FormaPagoOption[]>('/cxc/catalogos/formas-pago'),
      apiClient.get<CatalogoOption[]>('/cxc/catalogos/monedas'),
    ])
      .then(([clientesData, formasData, monedasData]) => {
        setClientes(clientesData);
        setFormas(formasData);
        setMonedas(monedasData);
      })
      .catch(() => {
        setClientes([]);
        setFormas([]);
        setMonedas([]);
      });
  }, []);

  const formaSeleccionada = formas.find((f) => String(f.id) === idFormaPago);

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};

    const clienteErr = validateRequiredSelect(idCliente, 'un cliente');
    if (clienteErr) next.idCliente = clienteErr;

    const formaErr = validateRequiredSelect(idFormaPago, 'una forma de pago');
    if (formaErr) next.idFormaPago = formaErr;

    const monedaErr = validateRequiredSelect(idMoneda, 'una moneda');
    if (monedaErr) next.idMoneda = monedaErr;

    if (idBanco) {
      const bancoErr = validateRequiredNumber(idBanco, 'El ID del banco', {
        integer: true,
        positive: true,
      });
      if (bancoErr) next.idBanco = bancoErr;
    }

    const fechaErr = validateRequiredDate(fechaPago, 'La fecha de pago', {
      notFuture: true,
      maxDate: todayIso(),
    });
    if (fechaErr) next.fechaPago = fechaErr;

    const montoErr = validateMoney(monto, 'El monto', { required: true, positive: true });
    if (montoErr) next.monto = montoErr;

    if (formaSeleccionada?.requiereReferencia) {
      const refRequired = validateRequired(numeroReferencia, 'La referencia');
      if (refRequired) next.numeroReferencia = refRequired;
    }
    if (numeroReferencia) {
      const refErr = validateIdentifier(numeroReferencia, 'La referencia');
      if (refErr) next.numeroReferencia = refErr;
    }

    return next;
  }, [idCliente, idFormaPago, idMoneda, idBanco, fechaPago, monto, numeroReferencia, estado, formaSeleccionada]);

  const isFormValid = !hasErrors(validationErrors);
  const errorFor = (field: string, touchedValue = '') =>
    errors[field] ?? (touchedValue ? validationErrors[field] : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isFormValid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setBusy(true);
    const payload = {
      idCliente: Number(idCliente),
      idFormaPago: Number(idFormaPago),
      idMoneda: Number(idMoneda),
      idBanco: idBanco ? Number(idBanco) : undefined,
      fechaPago,
      monto: Number(monto),
      numeroReferencia: numeroReferencia.trim() || undefined,
      estado,
    };

    try {
      if (isEditing) await apiClient.patch(`/cxc/pagos/${pago!.idPago}`, payload);
      else await apiClient.post('/cxc/pagos', payload);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {};
        (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => {
          fieldErrors[d.campo] = d.mensaje;
        });
        setErrors(fieldErrors);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el pago');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Select
        label="Cliente"
        required
        value={idCliente}
        onChange={(e: any) => setIdCliente(e.target.value)}
        options={clientes.map((x) => ({ value: x.id, label: x.label }))}
        helperText="Selecciona el cliente al que pertenece el pago."
        error={errorFor('idCliente')}
      />

      <Select
        label="Forma de pago"
        required
        value={idFormaPago}
        onChange={(e: any) => setIdFormaPago(e.target.value)}
        options={formas.map((x) => ({ value: x.id, label: x.label }))}
        helperText="La referencia será obligatoria si la forma de pago así lo requiere."
        error={errorFor('idFormaPago')}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Moneda"
          required
          value={idMoneda}
          onChange={(e: any) => setIdMoneda(e.target.value)}
          options={monedas.map((x) => ({ value: x.id, label: x.label }))}
          helperText="Selecciona una moneda del catálogo maestro; no se captura el ID manualmente."
          error={errorFor('idMoneda')}
        />
        <TextInput
          label="ID Banco"
          type="number"
          restriction="integer"
          min={1}
          value={idBanco}
          onChange={(e: any) => setIdBanco(e.target.value)}
          helperText="Opcional. Se mantiene como ID hasta que el módulo Bancos publique un catálogo consultable."
          error={errorFor('idBanco', idBanco)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha de pago"
          type="date"
          required
          max={todayIso()}
          value={fechaPago}
          onChange={(e: any) => setFechaPago(e.target.value)}
          helperText="Fecha real del pago; no puede ser futura."
          error={errorFor('fechaPago', fechaPago)}
        />
        <TextInput
          label="Monto"
          type="number"
          restriction="decimal"
          decimalPlaces={2}
          min={0.01}
          step="0.01"
          required
          value={monto}
          onChange={(e: any) => setMonto(e.target.value)}
          helperText="Monto recibido; mayor a 0 y máximo 2 decimales."
          error={errorFor('monto', monto)}
        />
      </div>

      <TextInput
        label="Número de referencia"
        restriction="identifier"
        uppercase
        maxLength={80}
        required={Boolean(formaSeleccionada?.requiereReferencia)}
        helperText={
          formaSeleccionada?.requiereReferencia
            ? 'Obligatoria para la forma de pago seleccionada. Admite letras, números, -, _ y /.'
            : 'Referencia opcional del medio de pago. Admite letras, números, -, _ y /.'
        }
        value={numeroReferencia}
        onChange={(e: any) => setNumeroReferencia(e.target.value)}
        error={errorFor('numeroReferencia', numeroReferencia)}
      />

      <Select
        label="Estado"
        required
        value={estado}
        onChange={(e: any) => setEstado(e.target.value)}
        options={ESTADOS_PAGO.map((value) => ({
          value,
          label: value.charAt(0) + value.slice(1).toLowerCase(),
        }))}
        helperText="Selecciona el estado actual del pago."
      />

      {formError && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <FormActionButtons
        onCancel={onCancel}
        isSubmitting={busy}
        isEditing={isEditing}
        isFormValid={isFormValid}
        createLabel="Guardar pago"
      />
    </form>
  );
}
