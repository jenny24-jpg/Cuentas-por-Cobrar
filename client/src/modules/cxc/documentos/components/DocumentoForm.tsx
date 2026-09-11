import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  BUSINESS_DATE_MAX,
  BUSINESS_DATE_MIN,
  hasErrors,
  todayIso,
  validateIdentifier,
  validateMoney,
  validateRequired,
  validateRequiredDate,
  validateRequiredSelect,
  type ValidationErrors,
} from '../../../../shared/validation';
import type { Documento, DocumentoCatalogoOption } from '@erp/contracts';

const ESTADOS_DOCUMENTO = ['PENDIENTE', 'PARCIAL', 'PAGADO', 'VENCIDO', 'ANULADO'] as const;
const ESTADO_OPTIONS = ESTADOS_DOCUMENTO.map((value) => ({
  value,
  label: value.charAt(0) + value.slice(1).toLowerCase(),
}));

interface Props {
  documento?: Documento | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const DocumentoForm = ({ documento, onSuccess, onCancel }: Props) => {
  const isEditing = Boolean(documento);

  const [clientes, setClientes] = useState<DocumentoCatalogoOption[]>([]);
  const [tipos, setTipos] = useState<DocumentoCatalogoOption[]>([]);
  const [monedas, setMonedas] = useState<DocumentoCatalogoOption[]>([]);

  const [idCliente, setIdCliente] = useState(documento?.idCliente?.toString() ?? '');
  const [nitCliente, setNitCliente] = useState(documento?.nitCliente ?? '');
  const [idTipoDocumento, setIdTipoDocumento] = useState(documento?.idTipoDocumento?.toString() ?? '');
  const [idMoneda, setIdMoneda] = useState(documento?.idMoneda?.toString() ?? '');
  const [estado, setEstado] = useState(documento?.estado ?? 'PENDIENTE');
  const [serie, setSerie] = useState(documento?.serie ?? '');
  const [numeroDocumento, setNumeroDocumento] = useState(documento?.numeroDocumento ?? '');
  const [fechaDocumento, setFechaDocumento] = useState(documento?.fechaDocumento?.slice(0, 10) ?? '');
  const [fechaVencimiento, setFechaVencimiento] = useState(documento?.fechaVencimiento?.slice(0, 10) ?? '');
  const [total, setTotal] = useState(documento?.total?.toString() ?? '');
  const [saldo, setSaldo] = useState(documento?.saldo?.toString() ?? '');

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/clientes'),
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/tipos-documento'),
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/monedas'),
    ])
      .then(([clientesData, tiposData, monedasData]) => {
        setClientes(clientesData);
        setTipos(tiposData);
        setMonedas(monedasData);

        if (documento?.idCliente) {
          const selected = clientesData.find((c) => c.id === documento.idCliente);
          if (selected?.nit !== undefined) setNitCliente(selected.nit ?? '');
        }
      })
      .catch(() => {
        setClientes([]);
        setTipos([]);
        setMonedas([]);
      });
  }, [documento?.idCliente]);

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};

    const clienteErr = validateRequiredSelect(idCliente, 'un cliente');
    if (clienteErr) next.idCliente = clienteErr;

    const tipoErr = validateRequiredSelect(idTipoDocumento, 'un tipo de documento');
    if (tipoErr) next.idTipoDocumento = tipoErr;

    const monedaErr = validateRequiredSelect(idMoneda, 'una moneda');
    if (monedaErr) next.idMoneda = monedaErr;

    if (!ESTADOS_DOCUMENTO.includes(estado as (typeof ESTADOS_DOCUMENTO)[number])) {
      next.estado = 'Selecciona un estado válido.';
    }

    if (serie) {
      const serieErr = validateIdentifier(serie, 'La serie');
      if (serieErr) next.serie = serieErr;
    }

    const numeroRequired = validateRequired(numeroDocumento, 'El número de documento');
    if (numeroRequired) {
      next.numeroDocumento = numeroRequired;
    } else {
      const numeroErr = validateIdentifier(numeroDocumento, 'El número de documento');
      if (numeroErr) next.numeroDocumento = numeroErr;
    }

    const fechaDocumentoErr = validateRequiredDate(fechaDocumento, 'La fecha del documento', {
      notFuture: true,
      minDate: BUSINESS_DATE_MIN,
      maxDate: todayIso(),
    });
    if (fechaDocumentoErr) next.fechaDocumento = fechaDocumentoErr;

    const fechaVencimientoErr = validateRequiredDate(fechaVencimiento, 'La fecha de vencimiento', {
      minDate: BUSINESS_DATE_MIN,
      maxDate: BUSINESS_DATE_MAX,
      notBefore: fechaDocumento ? { date: fechaDocumento, label: 'la fecha del documento' } : undefined,
    });
    if (fechaVencimientoErr) next.fechaVencimiento = fechaVencimientoErr;

    const totalErr = validateMoney(total, 'El total', { required: true, positive: true });
    if (totalErr) next.total = totalErr;

    const saldoEvaluado = isEditing ? saldo : total;
    const saldoErr = validateMoney(saldoEvaluado, 'El saldo', { required: true, min: 0 });
    if (saldoErr) {
      next.saldo = saldoErr;
    } else if (total && saldoEvaluado && Number(saldoEvaluado) > Number(total)) {
      next.saldo = 'El saldo no puede ser mayor que el total del documento.';
    }

    return next;
  }, [
    idCliente,
    idTipoDocumento,
    idMoneda,
    estado,
    serie,
    numeroDocumento,
    fechaDocumento,
    fechaVencimiento,
    total,
    saldo,
    isEditing,
  ]);

  const isFormValid = !hasErrors(validationErrors);

  const errorFor = (field: string, value?: string) =>
    errors[field] ?? (value ? validationErrors[field] : undefined);

  const handleClienteChange = (value: string) => {
    setIdCliente(value);
    const selected = clientes.find((c) => String(c.id) === value);
    setNitCliente(selected?.nit ?? '');
  };

  const handleTotalChange = (value: string) => {
    setTotal(value);
    if (!isEditing) setSaldo(value);
  };

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
      idCliente: Number(idCliente),
      // El backend vuelve a obtener el NIT desde CLIENTE para no confiar en
      // un valor manipulable desde el navegador.
      nitCliente: nitCliente || undefined,
      idTipoDocumento: Number(idTipoDocumento),
      idMoneda: Number(idMoneda),
      estado,
      serie: serie.trim() || undefined,
      numeroDocumento: numeroDocumento.trim(),
      fechaDocumento,
      fechaVencimiento,
      total: Number(total),
      saldo: Number(isEditing ? saldo : total),
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/documentos/${documento!.idDocumento}`, payload);
      } else {
        await apiClient.post('/cxc/documentos', payload);
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {};
        (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => {
          fieldErrors[d.campo] = d.mensaje;
        });
        setErrors(fieldErrors);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el documento');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Cliente"
          required
          value={idCliente}
          onChange={(e: any) => handleClienteChange(e.target.value)}
          options={clientes.map((c) => ({ value: c.id, label: c.label }))}
          helperText="Selecciona el cliente; el NIT se carga automáticamente desde el catálogo maestro."
          error={errorFor('idCliente')}
        />
        <TextInput
          label="NIT del cliente"
          value={nitCliente}
          isReadOnly
          helperText="Dato maestro del cliente. No se edita desde el documento."
          placeholder="Se carga al seleccionar el cliente"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Select
          label="Tipo de documento"
          required
          value={idTipoDocumento}
          onChange={(e: any) => setIdTipoDocumento(e.target.value)}
          options={tipos.map((t) => ({ value: t.id, label: t.label }))}
          helperText="Define la naturaleza contable del documento."
          error={errorFor('idTipoDocumento')}
        />
        <Select
          label="Moneda"
          required
          value={idMoneda}
          onChange={(e: any) => setIdMoneda(e.target.value)}
          options={monedas.map((m) => ({ value: m.id, label: m.label }))}
          helperText="Moneda en la que fue emitido el documento."
          error={errorFor('idMoneda')}
        />
        <Select
          label="Estado"
          required
          value={estado}
          onChange={(e: any) => setEstado(e.target.value)}
          options={ESTADO_OPTIONS}
          isReadOnly={!isEditing}
          helperText={
            isEditing
              ? 'Usa únicamente estados válidos del ciclo de CxC.'
              : 'Todo documento nuevo inicia como Pendiente.'
          }
          error={errorFor('estado', estado)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Serie"
          restriction="identifier"
          uppercase
          maxLength={30}
          helperText="Serie fiscal o interna; letras y números, admite -, _ y / (máx. 30)."
          value={serie}
          onChange={(e: any) => setSerie(e.target.value)}
          error={errorFor('serie', serie)}
          placeholder="Ej. FACE-63"
        />
        <TextInput
          label="Número de documento"
          required
          restriction="identifier"
          uppercase
          maxLength={50}
          helperText="Correlativo o referencia del documento; no admite texto libre ni símbolos especiales."
          value={numeroDocumento}
          onChange={(e: any) => setNumeroDocumento(e.target.value)}
          error={errorFor('numeroDocumento', numeroDocumento)}
          placeholder="Ej. A001-000123"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha del documento"
          type="date"
          required
          min={BUSINESS_DATE_MIN}
          max={todayIso()}
          value={fechaDocumento}
          onChange={(e: any) => setFechaDocumento(e.target.value)}
          helperText="Fecha real de emisión; no puede ser futura."
          error={errorFor('fechaDocumento', fechaDocumento)}
        />
        <TextInput
          label="Fecha de vencimiento"
          type="date"
          required
          min={fechaDocumento || BUSINESS_DATE_MIN}
          max={BUSINESS_DATE_MAX}
          value={fechaVencimiento}
          onChange={(e: any) => setFechaVencimiento(e.target.value)}
          helperText="Debe ser igual o posterior a la fecha del documento."
          error={errorFor('fechaVencimiento', fechaVencimiento)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Total"
          type="number"
          restriction="decimal"
          decimalPlaces={2}
          step="0.01"
          required
          value={total}
          onChange={(e: any) => handleTotalChange(e.target.value)}
          helperText="Importe total del documento; mayor a 0 y máximo 2 decimales."
          error={errorFor('total', total)}
          placeholder="0.00"
        />
        <TextInput
          label="Saldo"
          type="number"
          restriction="decimal"
          decimalPlaces={2}
          step="0.01"
          required
          value={isEditing ? saldo : total}
          onChange={(e: any) => setSaldo(e.target.value)}
          isReadOnly={!isEditing}
          helperText={
            isEditing
              ? 'Debe estar entre 0 y el total. Los pagos/aplicaciones deben reducirlo.'
              : 'Al crear, el saldo inicia automáticamente igual al total.'
          }
          error={errorFor('saldo', isEditing ? saldo : total)}
          placeholder="0.00"
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
        isFormValid={isFormValid}
        createLabel="Crear documento"
      />
    </form>
  );
};
