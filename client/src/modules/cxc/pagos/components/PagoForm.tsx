
import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select, StatusBadge } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';

import {
  hasErrors,
  validateMoney,
  validateRequiredDate,
  validateRequiredSelect,
  type ValidationErrors,
} from '../../../../shared/validation';

import type {
  CatalogoOption,
  FormaPagoOption,
  Pago,
} from '@erp/contracts';

import { SearchableSelect } from '../../../../shared/components/SearchableSelect';
import { CampoUsuarioActual } from '../../../../shared/components/CampoUsuarioActual';

// =====================================================
// ESTADOS PERMITIDOS AL REGISTRAR
// =====================================================

const REGISTRATION_STATES = [
  { value: 'NO_IDENTIFICADO', label: 'No identificado' },
  { value: 'NO_APLICADO', label: 'No aplicado' },
  { value: 'EN_CUENTA', label: 'En cuenta' },
];

// =====================================================
// FECHA ACTUAL DE GUATEMALA
// =====================================================

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

// =====================================================
// FORMULARIO DE PAGOS
// =====================================================

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

  const hasApplications =
    Number(pago?.montoAplicado ?? 0) > 0.005;

  const terminalState = [
    'APLICADO',
    'REVERSADO',
    'ANULADO',
  ].includes(
    String(pago?.estado ?? '').toUpperCase(),
  );

  const isLocked = hasApplications || terminalState;

  // =====================================================
  // CATÁLOGOS
  // =====================================================

  const [clientes, setClientes] =
    useState<CatalogoOption[]>([]);

  const [formas, setFormas] =
    useState<FormaPagoOption[]>([]);

  const [monedas, setMonedas] =
    useState<CatalogoOption[]>([]);

  const [bancos, setBancos] =
    useState<CatalogoOption[]>([]);

  // =====================================================
  // DATOS DEL FORMULARIO
  // =====================================================

  const [idCliente, setIdCliente] = useState(
    pago?.idCliente?.toString() ?? '',
  );

  const [idFormaPago, setIdFormaPago] = useState(
    pago?.idFormaPago?.toString() ?? '',
  );

  const [idMoneda, setIdMoneda] = useState(
    pago?.idMoneda?.toString() ?? '',
  );

  const [idBanco, setIdBanco] = useState(
    pago?.idBanco?.toString() ?? '',
  );

  // CORRECCIÓN:
  // Al crear, la fecha se obtiene automáticamente.
  // Al editar, se conserva la fecha original.
  //
  // No usamos setFechaPago porque el usuario
  // no debe modificar este valor.

  const fechaPago = isEditing
    ? pago?.fechaPago?.slice(0, 10) ?? ''
    : hoyGuatemalaIso();

  const [monto, setMonto] = useState(
    pago?.monto?.toString() ?? '',
  );

  const numeroReferencia =
    pago?.numeroReferencia ?? '';

  const [estado, setEstado] = useState(
    pago?.estado ?? 'NO_APLICADO',
  );

  const [errors, setErrors] =
    useState<ValidationErrors>({});

  const [formError, setFormError] =
    useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  // =====================================================
  // CARGAR CATÁLOGOS
  // =====================================================

  useEffect(() => {
    let activo = true;

    Promise.all([
      apiClient.get<CatalogoOption[]>(
        '/cxc/catalogos/clientes',
      ),
      apiClient.get<FormaPagoOption[]>(
        '/cxc/catalogos/formas-pago',
      ),
      apiClient.get<CatalogoOption[]>(
        '/cxc/catalogos/monedas',
      ),
      apiClient.get<CatalogoOption[]>(
        '/cxc/catalogos/bancos',
      ),
    ])
      .then(([
        clientesData,
        formasData,
        monedasData,
        bancosData,
      ]) => {
        if (!activo) return;

        setClientes(clientesData);
        setFormas(formasData);
        setMonedas(monedasData);
        setBancos(bancosData);
      })
      .catch(() => {
        if (!activo) return;

        setClientes([]);
        setFormas([]);
        setMonedas([]);
        setBancos([]);
      });

    return () => {
      activo = false;
    };
  }, []);

  // =====================================================
  // OPCIONES DE ESTADO
  // =====================================================

  const stateOptions = useMemo(() => {
    if (
      !estado ||
      REGISTRATION_STATES.some(
        (option) => option.value === estado,
      )
    ) {
      return REGISTRATION_STATES;
    }

    return [
      ...REGISTRATION_STATES,
      {
        value: estado,
        label: estado
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/^./, (c) => c.toUpperCase()),
      },
    ];
  }, [estado]);

  // =====================================================
  // VALIDACIONES
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

    const formaErr = validateRequiredSelect(
      idFormaPago,
      'una forma de pago',
    );

    if (formaErr) {
      next.idFormaPago = formaErr;
    }

    const monedaErr = validateRequiredSelect(
      idMoneda,
      'una moneda',
    );

    if (monedaErr) {
      next.idMoneda = monedaErr;
    }

    // La fecha está bloqueada, pero seguimos
    // verificando que exista y sea válida.
    //
    // En edición, no exigimos que sea hoy:
    // los pagos históricos conservan su fecha.

    const fechaErr = validateRequiredDate(
      fechaPago,
      'La fecha de pago',
      {
        notFuture: true,
        maxDate: hoyGuatemalaIso(),
      },
    );

    if (fechaErr) {
      next.fechaPago = fechaErr;
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
      ![
        'NO_IDENTIFICADO',
        'NO_APLICADO',
        'EN_CUENTA',
      ].includes(estado) &&
      !isLocked
    ) {
      next.estado =
        'Selecciona un estado válido para registrar el pago.';
    }

    return next;
  }, [
    idCliente,
    idFormaPago,
    idMoneda,
    fechaPago,
    monto,
    estado,
    isLocked,
  ]);

  const isFormValid =
    !hasErrors(validationErrors) &&
    !isLocked &&
    !busy;

  const errorFor = (
    field: string,
    touchedValue = '',
  ) =>
    errors[field] ??
    (touchedValue
      ? validationErrors[field]
      : undefined);

  // =====================================================
  // GUARDAR PAGO
  // =====================================================

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (busy) return;

    if (isLocked) {
      setFormError(
        'El pago ya tiene aplicaciones o está cerrado. Debe reversarse antes de modificarlo.',
      );
      return;
    }

    if (!isFormValid) {
      setErrors(validationErrors);
      return;
    }

    // Obtener de nuevo la fecha al guardar
    // para evitar utilizar una fecha antigua
    // si el formulario permaneció abierto
    // durante un cambio de día.

    const fechaActual = hoyGuatemalaIso();

    if (!isEditing) {
      const fechaErr = validateRequiredDate(
        fechaActual,
        'La fecha de pago',
        {
          notFuture: true,
          maxDate: fechaActual,
        },
      );

      if (fechaErr) {
        setErrors({
          fechaPago: fechaErr,
        });
        return;
      }
    }

    setErrors({});
    setBusy(true);

    // Campos comunes para crear y editar.
    const datosPago = {
      idCliente: Number(idCliente),
      idFormaPago: Number(idFormaPago),
      idMoneda: Number(idMoneda),
      idBanco: idBanco
        ? Number(idBanco)
        : undefined,
      monto: Number(monto),
      estado,
    };

    try {
      if (isEditing) {
        // CORRECCIÓN:
        // No enviamos fechaPago en PATCH.
        // Así se conserva la fecha histórica
        // registrada en Oracle.

        await apiClient.patch(
          `/cxc/pagos/${pago!.idPago}`,
          datosPago,
        );
      } else {
        // CORRECCIÓN:
        // La fecha de un nuevo pago siempre
        // se genera al momento de guardar.

        await apiClient.post(
          '/cxc/pagos',
          {
            ...datosPago,
            fechaPago: fechaActual,
          },
        );
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
          fieldErrors[detalle.campo] =
            detalle.mensaje;
        });

        setErrors(fieldErrors);
      } else {
        setFormError(
          err instanceof ApiError
            ? err.message
            : 'No se pudo guardar el pago',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  // =====================================================
  // INTERFAZ
  // =====================================================

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4"
      noValidate
    >
      {isEditing && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="form-label font-semibold text-slate-700">
              Estado:
            </span>

            <StatusBadge status={pago?.estado} />

            <span className="ml-auto text-slate-600">
              Aplicado:{' '}
              <strong>
                Q {Number(
                  pago?.montoAplicado ?? 0,
                ).toFixed(2)}
              </strong>
              {' '}· Disponible:{' '}
              <strong>
                Q {Number(
                  pago?.montoDisponible ??
                  pago?.monto ??
                  0,
                ).toFixed(2)}
              </strong>
            </span>
          </div>
        </div>
      )}

      {isLocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este pago ya tiene aplicaciones o está cerrado.
          Para corregirlo debe utilizarse el flujo de reversión.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <SearchableSelect
          label="Cliente"
          required
          value={idCliente}
          onChange={(e: any) =>
            setIdCliente(e.target.value)
          }
          options={clientes.map((x) => ({
            value: x.id,
            label: x.label,
          }))}
          helperText="Cliente al que pertenece el pago."
          error={errorFor('idCliente')}
          isReadOnly={isLocked}
        />

        <Select
          label="Forma de pago"
          required
          value={idFormaPago}
          onChange={(e: any) =>
            setIdFormaPago(e.target.value)
          }
          options={formas.map((x) => ({
            value: x.id,
            label: x.label,
          }))}
          helperText="Medio con el que se recibió el pago."
          error={errorFor('idFormaPago')}
          isReadOnly={isLocked}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Moneda"
          required
          value={idMoneda}
          onChange={(e: any) =>
            setIdMoneda(e.target.value)
          }
          options={monedas.map((x) => ({
            value: x.id,
            label: x.label,
          }))}
          helperText="Selecciona una moneda del catálogo maestro."
          error={errorFor('idMoneda')}
          isReadOnly={isLocked}
        />

        <Select
          label="Banco"
          placeholder="Ninguno (opcional)"
          value={idBanco}
          onChange={(e: any) =>
            setIdBanco(e.target.value)
          }
          options={bancos.map((x) => ({
            value: x.id,
            label: x.label,
          }))}
          helperText="Opcional. Solo aplica si el pago se recibió por transferencia/depósito bancario."
          error={errorFor('idBanco')}
          isReadOnly={isLocked}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha de pago"
          type="date"
          required
          value={fechaPago}
          isReadOnly
          helperText={
            isEditing
              ? 'Fecha original del pago. No se puede modificar.'
              : 'Fecha automática del sistema (Guatemala). No se puede modificar.'
          }
          error={errorFor(
            'fechaPago',
            fechaPago,
          )}
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
          onChange={(e: any) =>
            setMonto(e.target.value)
          }
          helperText="Monto recibido; mayor a 0 y máximo 2 decimales."
          error={errorFor('monto', monto)}
          isReadOnly={isLocked}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <TextInput
          label="Número de referencia"
          value={
            numeroReferencia ||
            'Se asigna al guardar'
          }
          isReadOnly
          helperText="Correlativo automático del sistema (PAG-AAAA-000001); no se edita."
        />

        <Select
          label="Estado al registrar"
          required
          value={estado}
          onChange={(e: any) =>
            setEstado(e.target.value)
          }
          options={stateOptions}
          helperText="Tras aplicar el pago, el estado lo administra el motor financiero."
          error={errorFor('estado', estado)}
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
        isSubmitting={busy}
        isEditing={isEditing}
        isFormValid={isFormValid}
        blockers={validationErrors}
        lockedReason={
          isLocked
            ? 'El pago ya tiene aplicaciones o está cerrado; debe reversarse antes de modificarlo.'
            : undefined
        }
        createLabel="Guardar pago"
      />
    </form>
  );
}
