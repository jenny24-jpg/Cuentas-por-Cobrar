
import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select, TextArea, StatusBadge } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  hasErrors,
  validateMaxLength,
  validateMoney,
  validateRequiredDate,
  validateRequiredSelect,
  type ValidationErrors,
} from '../../../../shared/validation';
import type { CatalogoOption, NotaCredito } from '@erp/contracts';
import { SearchableSelect } from '../../../../shared/components/SearchableSelect';
import { CampoUsuarioActual } from '../../../../shared/components/CampoUsuarioActual';

interface NotaCreditoFormProps {
  nota?: NotaCredito | null;
  onSuccess: () => void;
  onCancel: () => void;
}

// Fecha actual de Guatemala en formato YYYY-MM-DD.
function hoyGuatemalaIso(): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const obtener = (tipo: string): string =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';

  return `${obtener('year')}-${obtener('month')}-${obtener('day')}`;
}

export const NotaCreditoForm = ({
  nota,
  onSuccess,
  onCancel,
}: NotaCreditoFormProps) => {
  const isEditing = !!nota;

  const hasApplications = Number(nota?.montoAplicado ?? 0) > 0.005;

  const terminalState = ['APLICADA', 'ANULADA'].includes(
    String(nota?.estado ?? '').toUpperCase(),
  );

  const isLocked = hasApplications || terminalState;

  const [clientes, setClientes] = useState<CatalogoOption[]>([]);
  const [documentos, setDocumentos] = useState<CatalogoOption[]>([]);

  const [idCliente, setIdCliente] = useState(
    nota?.idCliente?.toString() ?? '',
  );

  const [idDocumentoReferencia, setIdDocumentoReferencia] = useState(
    nota?.idDocumentoReferencia?.toString() ?? '',
  );

  const [descripcion, setDescripcion] = useState(
    nota?.descripcion ?? '',
  );

  const serie = nota?.serie ?? '';
  const numero = nota?.numero ?? '';

  // Fecha de solo lectura: hoy en Guatemala al crear y original al editar.
  // No hay setter: el usuario no puede modificarla desde el formulario.
  const fecha = isEditing
    ? nota?.fecha?.slice(0, 10) ?? ''
    : hoyGuatemalaIso();

  const [monto, setMonto] = useState(
    nota?.monto?.toString() ?? '',
  );

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hoy = hoyGuatemalaIso();

  // =====================================================
  // CARGAR CLIENTES
  // =====================================================

  useEffect(() => {
    let activo = true;

    apiClient
      .get<CatalogoOption[]>('/cxc/catalogos/clientes')
      .then((data) => {
        if (activo) setClientes(data);
      })
      .catch(() => {
        if (activo) setClientes([]);
      });

    return () => {
      activo = false;
    };
  }, []);

  // =====================================================
  // CARGAR DOCUMENTOS DEL CLIENTE
  // =====================================================

  useEffect(() => {
    if (!idCliente) {
      setDocumentos([]);
      return;
    }

    let activo = true;
    setDocumentos([]);

    apiClient
      .get<CatalogoOption[]>(
        `/cxc/catalogos/clientes/${encodeURIComponent(idCliente)}/documentos-pendientes`,
      )
      .then((data) => {
        if (activo) setDocumentos(data);
      })
      .catch(() => {
        if (activo) setDocumentos([]);
      });

    return () => {
      activo = false;
    };
  }, [idCliente]);

  const selectedDocumento = documentos.find(
    (documento) => String(documento.id) === idDocumentoReferencia,
  );

  // =====================================================
  // VALIDACIONES DEL FORMULARIO
  // =====================================================

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};

    const clienteErr = validateRequiredSelect(
      idCliente,
      'un cliente',
    );

    if (clienteErr) {
      next.idCliente = clienteErr;
    }

    if (!idDocumentoReferencia) {
      next.idDocumentoReferencia = 'Selecciona el documento al que aplica la nota.';
    }

    // La fecha no puede ser futura.
    // Se utiliza como límite la fecha de negocio de Guatemala.
    const fechaErr = validateRequiredDate(
      fecha,
      'La fecha',
      {
        notFuture: true,
        maxDate: hoy,
      },
    );

    if (fechaErr) {
      next.fecha = fechaErr;
    }

    const montoErr = validateMoney(
      monto,
      'El monto',
      {
        required: true,
        positive: true,
      },
    );

    if (montoErr) {
      next.monto = montoErr;
    }

    if (
      !montoErr &&
      selectedDocumento?.saldo !== undefined &&
      Number(monto) > Number(selectedDocumento.saldo)
    ) {
      next.monto =
        'El monto no puede superar el saldo pendiente del documento seleccionado.';
    }

    const descripcionErr = descripcion.trim().length < 10
      ? 'Describe el motivo de la nota (mínimo 10 caracteres).'
      : validateMaxLength(descripcion, 'La descripción', 250);

    if (descripcionErr) {
      next.descripcion = descripcionErr;
    }

    return next;
  }, [
    idCliente,
    idDocumentoReferencia,
    fecha,
    monto,
    descripcion,
    selectedDocumento,
    hoy,
  ]);

  const isFormValid =
    !hasErrors(validationErrors) &&
    !isLocked &&
    !isSubmitting;

  // =====================================================
  // CAMBIO DE CLIENTE
  // =====================================================

  const handleClienteChange = (value: string) => {
    setIdCliente(value);
    setIdDocumentoReferencia('');
    setDocumentos([]);
    setErrors({});
    setFormError(null);
  };

  // =====================================================
  // GUARDAR NOTA DE CRÉDITO
  // =====================================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setFormError(null);

    if (isLocked) {
      setFormError(
        'La nota ya tiene aplicaciones o está cerrada. Debe reversarse antes de modificarla.',
      );
      return;
    }

    if (isSubmitting) {
      return;
    }

    // La fecha de creación se recalcula al guardar, según Guatemala.
    // No se reemplaza la fecha histórica durante una edición.
    const fechaActual = hoyGuatemalaIso();

    if (hasErrors(validationErrors)) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    const payload = {
      idCliente: Number(idCliente),
      idDocumentoReferencia: Number(idDocumentoReferencia),
      descripcion: descripcion.trim(),
      monto: Number(monto),
    };

    try {
      if (isEditing) {
        // Nunca enviar FECHA en el PATCH: conserva la fecha original.
        await apiClient.patch(
          `/cxc/notas-credito/${nota!.idNotaCredito}`,
          payload,
        );
      } else {
        await apiClient.post('/cxc/notas-credito', {
          ...payload,
          fecha: fechaActual,
        });
      }

      onSuccess();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 400 &&
        Array.isArray(err.details)
      ) {
        const fieldErrors: ValidationErrors = {};

        (
          err.details as Array<{
            campo: string;
            mensaje: string;
          }>
        ).forEach((detalle) => {
          fieldErrors[detalle.campo] = detalle.mensaje;
        });

        setErrors(fieldErrors);
      } else {
        setFormError(
          err instanceof ApiError
            ? err.message
            : 'No se pudo guardar la nota de crédito',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // =====================================================
  // FORMULARIO
  // =====================================================

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        La nota de crédito no reduce el saldo al registrarse.
        El efecto financiero ocurre únicamente cuando se aplica
        a un documento.
      </div>

      {isEditing && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="form-label font-semibold text-slate-700">Estado:</span>
            <StatusBadge status={nota?.estado} />

            <span className="ml-auto text-slate-600">
              Aplicado:{' '}
              <strong>
                Q {Number(nota?.montoAplicado ?? 0).toFixed(2)}
              </strong>
              {' '}· Disponible:{' '}
              <strong>
                Q {Number(
                  nota?.montoDisponible ?? nota?.monto ?? 0,
                ).toFixed(2)}
              </strong>
            </span>
          </div>
        </div>
      )}

      {isLocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Esta nota ya tiene aplicaciones o está cerrada.
          Su cabecera queda bloqueada para proteger la trazabilidad.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <SearchableSelect
          label="Cliente"
          required
          value={idCliente}
          onChange={(e: any) =>
            handleClienteChange(e.target.value)
          }
          options={clientes.map((cliente) => ({
            value: cliente.id,
            label: cliente.label,
          }))}
          error={errors.idCliente}
          placeholder="Seleccionar cliente"
          helperText="Cliente al que pertenece la nota de crédito."
          isReadOnly={isLocked}
        />

        <Select
          label="Documento de referencia"
          required
          value={idDocumentoReferencia}
          onChange={(e: any) =>
            setIdDocumentoReferencia(e.target.value)
          }
          options={documentos.map((documento) => ({
            value: documento.id,
            label: documento.label,
          }))}
          placeholder={
            idCliente
              ? 'Seleccionar documento'
              : 'Selecciona un cliente primero'
          }
          isReadOnly={!idCliente || isLocked}
          error={errors.idDocumentoReferencia}
          helperText="Obligatorio; solo se muestran documentos con saldo pendiente del cliente."
        />
      </div>

      <TextInput
        label="Serie y número"
        value={serie && numero ? `${serie}-${numero}` : 'Se asigna al guardar'}
        isReadOnly
        helperText="Correlativo automático del sistema; no se edita."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha"
          type="date"
          required
          value={fecha}
          error={errors.fecha ?? validationErrors.fecha}
          helperText={
            isEditing
              ? 'Fecha original de emisión. No se puede modificar.'
              : 'Fecha automática del sistema (Guatemala). No se puede modificar.'
          }
          isReadOnly
        />

        <TextInput
          label="Monto"
          type="number"
          restriction="decimal"
          decimalPlaces={2}
          step="0.01"
          min="0.01"
          required
          value={monto}
          onChange={(e: any) =>
            setMonto(e.target.value)
          }
          error={errors.monto}
          placeholder="0.00"
          helperText={
            selectedDocumento?.saldo !== undefined
              ? `Máximo según saldo del documento: Q ${Number(
                  selectedDocumento.saldo,
                ).toFixed(2)}.`
              : 'Monto positivo con máximo 2 decimales.'
          }
          isReadOnly={isLocked}
        />
      </div>

      <TextArea
        label="Descripción"
        required
        maxLength={250}
        helperText="Motivo de la nota de crédito; entre 10 y 250 caracteres."
        value={descripcion}
        onChange={(e: any) =>
          setDescripcion(e.target.value)
        }
        rows={3}
        error={errors.descripcion}
        placeholder="Motivo de la nota de crédito"
        isReadOnly={isLocked}
      />

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
        createLabel="Crear nota de crédito"
        isFormValid={isFormValid}
        blockers={validationErrors}
        lockedReason={
          isLocked
            ? 'La nota de crédito ya tiene aplicaciones o está cerrada; debe reversarse antes de modificarla.'
            : undefined
        }
      />
    </form>
  );
};
