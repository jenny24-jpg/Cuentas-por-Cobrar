import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select, StatusBadge } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  BUSINESS_DATE_MAX,
  BUSINESS_DATE_MIN,
  hasErrors,
  todayIso,
  validateMoney,
  validateRequiredDate,
  validateRequiredSelect,
  type ValidationErrors,
} from '../../../../shared/validation';
import type { Documento, DocumentoCatalogoOption } from '@erp/contracts';
import { SearchableSelect } from '../../../../shared/components/SearchableSelect';
import { CampoUsuarioActual } from '../../../../shared/components/CampoUsuarioActual';

interface Props {
  documento?: Documento | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const DocumentoForm = ({ documento, onSuccess, onCancel }: Props) => {
  const isEditing = Boolean(documento);
  const hasFinancialMovement = Boolean(
    documento && Math.abs(Number(documento.total) - Number(documento.saldo)) > 0.005,
  );
  const isTerminal = Boolean(
    documento && ['PAGADO', 'PAGADA', 'ANULADO', 'ANULADA'].includes(String(documento.estado).toUpperCase()),
  );
  const isLocked = hasFinancialMovement || isTerminal;

  const [clientes, setClientes] = useState<DocumentoCatalogoOption[]>([]);
  const [tipos, setTipos] = useState<DocumentoCatalogoOption[]>([]);
  const [monedas, setMonedas] = useState<DocumentoCatalogoOption[]>([]);
  const [condicionesCredito, setCondicionesCredito] = useState<DocumentoCatalogoOption[]>([]);

  const [idCliente, setIdCliente] = useState(documento?.idCliente?.toString() ?? '');
  const [nitCliente, setNitCliente] = useState(documento?.nitCliente ?? '');
  const [idTipoDocumento, setIdTipoDocumento] = useState(documento?.idTipoDocumento?.toString() ?? '');
  const [idMoneda, setIdMoneda] = useState(documento?.idMoneda?.toString() ?? '');
  const [idCondicionCredito, setIdCondicionCredito] = useState(documento?.idCondicionCredito?.toString() ?? '');
  // Alta: serie y número que tendrá el documento según el tipo elegido (vista previa
  // calculada en la base; el definitivo se confirma al guardar).
  const [previa, setPrevia] = useState<{ serie: string; numero: string } | null>(null);
  const [cargandoPrevia, setCargandoPrevia] = useState(false);
  useEffect(() => {
    if (isEditing || !idTipoDocumento) { setPrevia(null); return; }
    let activo = true;
    setCargandoPrevia(true);
    apiClient.get<{ serie: string; numero: string }>(`/cxc/documentos/siguiente-numero?idTipoDocumento=${encodeURIComponent(idTipoDocumento)}`)
      .then((data) => { if (activo) setPrevia(data); })
      .catch(() => { if (activo) setPrevia(null); })
      .finally(() => { if (activo) setCargandoPrevia(false); });
    return () => { activo = false; };
  }, [idTipoDocumento, isEditing]);
  const textoPrevio = !idTipoDocumento ? 'Selecciona el tipo de documento' : cargandoPrevia ? 'Calculando...' : '—';
  const serie = documento?.serie ?? previa?.serie ?? '';
  const numeroDocumento = documento?.numeroDocumento ?? previa?.numero ?? '';
  const [fechaDocumento] = useState(documento?.fechaDocumento?.slice(0, 10) ?? todayIso());
  const [total, setTotal] = useState(documento?.total?.toString() ?? '');
  // El vencimiento no se escribe: es la fecha del documento más los días de
  // crédito de la condición (el servidor hace el mismo cálculo al guardar).
  const condicionSeleccionada = condicionesCredito.find((c) => String(c.id) === idCondicionCredito);
  const fechaVencimiento = (() => {
    if (!fechaDocumento || condicionSeleccionada?.diasCredito === undefined) {
      return documento?.fechaVencimiento?.slice(0, 10) ?? '';
    }
    const [anio, mes, dia] = fechaDocumento.split('-').map(Number);
    return new Date(Date.UTC(anio, mes - 1, dia + condicionSeleccionada.diasCredito)).toISOString().slice(0, 10);
  })();

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/clientes'),
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/tipos-documento'),
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/monedas'),
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/condiciones-credito'),
    ])
      .then(([clientesData, tiposData, monedasData, condicionesData]) => {
        setClientes(clientesData);
        setTipos(tiposData);
        setMonedas(monedasData);
        setCondicionesCredito(condicionesData);

        if (documento?.idCliente) {
          const selected = clientesData.find((c) => c.id === documento.idCliente);
          if (selected?.nit !== undefined) setNitCliente(selected.nit ?? '');
        }
      })
      .catch(() => {
        setClientes([]);
        setTipos([]);
        setMonedas([]);
        setCondicionesCredito([]);
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

    const fechaDocumentoErr = validateRequiredDate(
      fechaDocumento,
      'La fecha del documento',
      {
        minDate: isEditing ? BUSINESS_DATE_MIN : todayIso(),
        maxDate: isEditing ? BUSINESS_DATE_MAX : todayIso(),
      },
    );
    if (fechaDocumentoErr) next.fechaDocumento = fechaDocumentoErr;

    if (!isEditing && fechaDocumento !== todayIso()) {
      next.fechaDocumento = 'La fecha del documento debe ser la de hoy.';
    }

    // La condición es obligatoria: de ella sale el vencimiento.
    if (!idCondicionCredito) next.idCondicionCredito = 'Selecciona la condición de crédito; de ella sale la fecha de vencimiento.';

    const totalErr = validateMoney(total, 'El total', { required: true, positive: true });
    if (totalErr) next.total = totalErr;

    return next;
  }, [
    idCliente,
    idTipoDocumento,
    idMoneda,
    fechaDocumento,
    idCondicionCredito,
    total,
    isEditing,
  ]);

  const isFormValid = !hasErrors(validationErrors) && !isLocked;
  const errorFor = (field: string, value?: string) =>
    errors[field] ?? (value ? validationErrors[field] : undefined);

  const handleClienteChange = (value: string) => {
    setIdCliente(value);
    const selected = clientes.find((c) => String(c.id) === value);
    setNitCliente(selected?.nit ?? '');
    // Se propone la condición de crédito del cliente; puede cambiarse.
    if (!isEditing) setIdCondicionCredito(selected?.idCondicion ? String(selected.idCondicion) : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isLocked) {
      setFormError('El documento ya tiene movimientos o está cerrado. Las correcciones deben hacerse mediante reversa, nota de crédito o ajuste autorizado.');
      return;
    }

    if (!isFormValid) {
      setErrors(validationErrors);
      return;
    }

    if (!isEditing && fechaDocumento !== todayIso()) {
  setErrors({
    fechaDocumento:
      'La fecha del documento debe ser la de hoy. Cierra y vuelve a abrir el formulario.',
  });
  return;
}

    setErrors({});
    setIsSubmitting(true);

    const payload = {
      idCliente: Number(idCliente),
      idTipoDocumento: Number(idTipoDocumento),
      idMoneda: Number(idMoneda),
      idCondicionCredito: idCondicionCredito ? Number(idCondicionCredito) : null,
      fechaDocumento,
      total: Number(total),
    };

    try {
      if (isEditing) await apiClient.patch(`/cxc/documentos/${documento!.idDocumento}`, payload);
      else await apiClient.post('/cxc/documentos', payload);
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
      {isEditing && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="form-label font-semibold text-slate-700">Estado financiero:</span>
            <StatusBadge status={documento?.estado} />
            {documento?.condicion === 'VENCIDA' && <StatusBadge status="VENCIDA" />}
            <span className="ml-auto text-slate-600">
              Saldo pendiente: <strong>Q {Number(documento?.saldo ?? 0).toFixed(2)}</strong>
            </span>
          </div>
        </div>
      )}

      {isLocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este documento ya tiene movimientos financieros o está cerrado. Su cabecera queda bloqueada para proteger la trazabilidad.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SearchableSelect
          label="Cliente"
          required
          value={idCliente}
          onChange={(e: any) => handleClienteChange(e.target.value)}
          options={clientes.map((c) => ({ value: c.id, label: c.label }))}
          helperText="Selecciona el cliente; el NIT se carga automáticamente desde el catálogo maestro."
          error={errorFor('idCliente')}
          isReadOnly={isLocked}
        />
        <TextInput
          label="NIT del cliente"
          value={nitCliente}
          isReadOnly
          helperText="Dato maestro del cliente. No se edita desde el documento."
          placeholder="Se carga al seleccionar el cliente"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Tipo de documento"
          required
          value={idTipoDocumento}
          onChange={(e: any) => setIdTipoDocumento(e.target.value)}
          options={tipos.map((t) => ({ value: t.id, label: t.label }))}
          helperText={isEditing ? 'No se cambia: define la serie y el número del documento.' : 'Define la naturaleza contable y la serie del documento.'}
          error={errorFor('idTipoDocumento')}
          isReadOnly={isLocked || isEditing}
        />
        <Select
          label="Moneda"
          required
          value={idMoneda}
          onChange={(e: any) => setIdMoneda(e.target.value)}
          options={monedas.map((m) => ({ value: m.id, label: m.label }))}
          helperText="Moneda en la que fue emitido el documento."
          error={errorFor('idMoneda')}
          isReadOnly={isLocked}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Serie"
          value={serie || textoPrevio}
          isReadOnly
          helperText="Automática según el tipo de documento."
        />
        <TextInput
          label="Número de documento"
          value={numeroDocumento || textoPrevio}
          isReadOnly
          helperText={isEditing
            ? 'Número asignado al documento.'
            : 'Siguiente correlativo de la serie. Si otro usuario guarda antes, al guardar se toma el siguiente libre.'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha del documento"
          type="date"
          required
          min={isEditing ? BUSINESS_DATE_MIN : todayIso()}
          max={isEditing ? BUSINESS_DATE_MAX : todayIso()}
          value={fechaDocumento}
          helperText={
            isEditing
              ? 'Fecha original del documento (no editable).'
              : 'Fecha de creación: hoy (automática, no editable).'
          }
          error={errorFor('fechaDocumento', fechaDocumento)}
          isReadOnly
        />
        <TextInput
          label="Fecha de vencimiento"
          type="date"
          value={fechaVencimiento}
          isReadOnly
          placeholder="Selecciona la condición de crédito"
          helperText={condicionSeleccionada
            ? `Automática: fecha del documento + ${condicionSeleccionada.diasCredito} día(s) de crédito.`
            : 'Automática según la condición de crédito.'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <Select
          label="Condición de crédito"
          required
          value={idCondicionCredito}
          onChange={(e: any) => setIdCondicionCredito(e.target.value)}
          options={condicionesCredito.map((c) => ({ value: c.id, label: c.label }))}
          placeholder="Seleccionar condición"
          error={errorFor('idCondicionCredito', idCondicionCredito)}
          helperText="Se propone la del cliente. Define el vencimiento y la mora del documento."
          isReadOnly={isLocked}
        />

        <TextInput
          label="Total"
          type="number"
          restriction="decimal"
          decimalPlaces={2}
          min={0.01}
          step="0.01"
          required
          value={total}
          onChange={(e: any) => setTotal(e.target.value)}
          helperText={isEditing ? 'Solo puede modificarse mientras el documento no tenga movimientos.' : 'El saldo inicial se genera automáticamente igual al total.'}
          error={errorFor('total', total)}
          isReadOnly={isLocked}
        />
      </div>


      {!isEditing && <CampoUsuarioActual />}
      {formError && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <FormActionButtons
        onCancel={onCancel}
        isSubmitting={isSubmitting}
        isEditing={isEditing}
        isFormValid={isFormValid} blockers={validationErrors} lockedReason={isLocked ? "El documento ya tiene movimientos o está cerrado; corrígelo con reversa, nota de crédito o ajuste autorizado." : undefined}
        createLabel="Crear documento"
      />
    </form>
  );
};
