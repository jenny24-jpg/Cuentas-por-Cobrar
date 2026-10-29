
import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select } from '../../../../shared/ui-kit';
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
  AplicacionAnticipo,
  CatalogoOption,
} from '@erp/contracts';

import { SearchableSelect } from '../../../../shared/components/SearchableSelect';
import { CampoUsuarioActual } from '../../../../shared/components/CampoUsuarioActual';

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
// FORMULARIO DE APLICACIÓN DE ANTICIPOS
// =====================================================

export function AplicacionAnticipoForm({
  item,
  onSuccess,
  onCancel,
}: {
  item?: AplicacionAnticipo | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(item);

  // =====================================================
  // CATÁLOGOS
  // =====================================================

  const [clientes, setClientes] =
    useState<CatalogoOption[]>([]);

  const [anticipos, setAnticipos] =
    useState<CatalogoOption[]>([]);

  const [documentos, setDocumentos] =
    useState<CatalogoOption[]>([]);

  const [cargandoCatalogos, setCargandoCatalogos] =
    useState(false);

  // =====================================================
  // CAMPOS DEL FORMULARIO
  // =====================================================

  const [idCliente, setIdCliente] = useState('');

  const [idAnticipo, setIdAnticipo] = useState(
    item?.idAnticipo?.toString() ?? '',
  );

  const [idDocumento, setIdDocumento] = useState(
    item?.idDocumento?.toString() ?? '',
  );

  // CORRECCIÓN:
  // La fecha de un registro nuevo siempre
  // corresponde al día actual en Guatemala.
  //
  // Al editar, conservamos la fecha original.
  // No existe un setter para cambiarla.

  const fechaAplicacion = isEditing
    ? item?.fechaAplicacion?.slice(0, 10) ?? ''
    : hoyGuatemalaIso();

  const [montoAplicado, setMonto] = useState(
    item?.montoAplicado?.toString() ?? '',
  );

  const [errors, setErrors] =
    useState<ValidationErrors>({});

  const [formError, setFormError] =
    useState<string | null>(null);

  const [busy, setBusy] = useState(false);

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
  // CARGAR ANTICIPOS Y DOCUMENTOS DEL CLIENTE
  // =====================================================

  useEffect(() => {
    if (!idCliente) {
      setAnticipos([]);
      setDocumentos([]);
      setCargandoCatalogos(false);
      return;
    }

    let activo = true;

    setAnticipos([]);
    setDocumentos([]);
    setCargandoCatalogos(true);

    Promise.all([
      apiClient.get<CatalogoOption[]>(
        `/cxc/catalogos/clientes/${encodeURIComponent(
          idCliente,
        )}/anticipos-disponibles`,
      ),

      apiClient.get<CatalogoOption[]>(
        `/cxc/catalogos/clientes/${encodeURIComponent(
          idCliente,
        )}/documentos-pendientes`,
      ),
    ])
      .then(([anticiposData, documentosData]) => {
        if (!activo) return;

        setAnticipos(anticiposData);
        setDocumentos(documentosData);
      })
      .catch(() => {
        if (!activo) return;

        setAnticipos([]);
        setDocumentos([]);

        setFormError(
          'No se pudieron consultar los anticipos o documentos del cliente.',
        );
      })
      .finally(() => {
        if (activo) {
          setCargandoCatalogos(false);
        }
      });

    return () => {
      activo = false;
    };
  }, [idCliente]);

  // =====================================================
  // ANTICIPO Y DOCUMENTO SELECCIONADOS
  // =====================================================

  const anticipoSeleccionado = anticipos.find(
    (anticipo) =>
      String(anticipo.id) === idAnticipo,
  );

  const documentoSeleccionado = documentos.find(
    (documento) =>
      String(documento.id) === idDocumento,
  );

  // =====================================================
  // MONTO MÁXIMO APLICABLE
  // =====================================================

  const maxAplicable = Math.min(
    anticipoSeleccionado?.saldo ??
      Number.POSITIVE_INFINITY,

    documentoSeleccionado?.saldo ??
      Number.POSITIVE_INFINITY,
  );

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

    const anticipoErr = validateRequiredSelect(
      idAnticipo,
      'un anticipo disponible',
    );

    if (anticipoErr) {
      next.idAnticipo = anticipoErr;
    }

    const documentoErr = validateRequiredSelect(
      idDocumento,
      'un documento pendiente del cliente',
    );

    if (documentoErr) {
      next.idDocumento = documentoErr;
    }

    // CORRECCIÓN:
    // La fecha sigue validándose, aunque
    // ahora no sea editable.
    //
    // Las fechas históricas se conservan
    // al abrir registros existentes.

    const fechaErr = validateRequiredDate(
      fechaAplicacion,
      'La fecha de aplicación',
      {
        notFuture: true,
        maxDate: hoyGuatemalaIso(),
      },
    );

    if (fechaErr) {
      next.fechaAplicacion = fechaErr;
    }

    // Para registros nuevos, los elementos
    // seleccionados deben existir realmente
    // en los catálogos del cliente.

    if (!isEditing && idCliente && !cargandoCatalogos) {
      if (
        idAnticipo &&
        !anticipoSeleccionado
      ) {
        next.idAnticipo =
          'El anticipo no está disponible para este cliente.';
      }

      if (
        idDocumento &&
        !documentoSeleccionado
      ) {
        next.idDocumento =
          'El documento no está disponible para este cliente.';
      }
    }

    const montoErr = validateMoney(
      montoAplicado,
      'El monto aplicado',
      {
        required: true,
        positive: true,
      },
    );

    if (montoErr) {
      next.montoAplicado = montoErr;
    } else if (
      !isEditing &&
      Number.isFinite(maxAplicable) &&
      Number(montoAplicado) > maxAplicable
    ) {
      next.montoAplicado =
        `El monto no puede superar Q ${maxAplicable.toFixed(2)}, ` +
        'según el disponible del anticipo y el saldo del documento.';
    }

    return next;
  }, [
    idCliente,
    idAnticipo,
    idDocumento,
    fechaAplicacion,
    montoAplicado,
    maxAplicable,
    anticipoSeleccionado,
    documentoSeleccionado,
    cargandoCatalogos,
    isEditing,
  ]);

  const isFormValid =
    !hasErrors(validationErrors) &&
    !busy &&
    !cargandoCatalogos;

  const errorFor = (
    field: string,
    value = '',
  ) =>
    errors[field] ??
    (value
      ? validationErrors[field]
      : undefined);

  // =====================================================
  // CAMBIAR CLIENTE
  // =====================================================

  const handleClienteChange = (value: string) => {
    setIdCliente(value);

    // Limpiar valores del cliente anterior.
    setIdAnticipo('');
    setIdDocumento('');
    setAnticipos([]);
    setDocumentos([]);

    setErrors({});
    setFormError(null);
  };

  // =====================================================
  // GUARDAR APLICACIÓN DE ANTICIPO
  // =====================================================

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (busy || cargandoCatalogos) {
      return;
    }

    if (!isFormValid) {
      setErrors(validationErrors);
      return;
    }

    // CORRECCIÓN:
    // Al crear, obtenemos nuevamente la fecha
    // para evitar usar un día anterior si el
    // formulario quedó abierto al cambiar de día.

    const hoyActual = hoyGuatemalaIso();

    if (!isEditing && fechaAplicacion !== hoyActual) {
      setErrors({
        fechaAplicacion:
          'La fecha del sistema cambió. Vuelve a abrir el formulario para continuar.',
      });
      return;
    }

    setBusy(true);
    setErrors({});

    // Los campos comunes no incluyen fecha.
    const datosAplicacion = {
      idAnticipo: Number(idAnticipo),
      idDocumento: Number(idDocumento),
      montoAplicado: Number(montoAplicado),
    };

    try {
      if (isEditing) {
        // La fecha histórica no se envía
        // al actualizar un registro.
        //
        // La posibilidad de editar aplicaciones
        // debe confirmarse con el servicio.

        await apiClient.patch(
          `/cxc/aplicaciones-anticipo/${item!.idAplicacionAnticipo}`,
          datosAplicacion,
        );
      } else {
        // La fecha de una nueva aplicación
        // se genera automáticamente.

        await apiClient.post(
          '/cxc/aplicaciones-anticipo',
          {
            ...datosAplicacion,
            fechaAplicacion: hoyActual,
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
            : 'No se pudo guardar la aplicación',
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
          placeholder="Seleccionar cliente"
          helperText="Determina los anticipos y documentos disponibles."
          error={errorFor('idCliente')}
        />

        <Select
          label="Anticipo"
          required
          value={idAnticipo}
          onChange={(e: any) => {
            setIdAnticipo(e.target.value);
            setErrors({});
          }}
          options={anticipos.map((anticipo) => ({
            value: anticipo.id,
            label: anticipo.label,
          }))}
          isReadOnly={
            !idCliente || cargandoCatalogos
          }
          placeholder={
            idCliente
              ? 'Seleccionar anticipo'
              : 'Selecciona un cliente primero'
          }
          helperText="Solo anticipos del cliente con monto disponible."
          error={errorFor('idAnticipo')}
        />

        <Select
          label="Documento"
          required
          value={idDocumento}
          onChange={(e: any) => {
            setIdDocumento(e.target.value);
            setErrors({});
          }}
          options={documentos.map((documento) => ({
            value: documento.id,
            label: documento.label,
          }))}
          isReadOnly={
            !idCliente || cargandoCatalogos
          }
          placeholder={
            idCliente
              ? 'Seleccionar documento pendiente'
              : 'Selecciona un cliente primero'
          }
          helperText="Solo documentos con saldo pendiente del cliente."
          error={errorFor('idDocumento')}
        />

        <TextInput
          label="Fecha de aplicación"
          type="date"
          required
          value={fechaAplicacion}
          isReadOnly
          helperText={
            isEditing
              ? 'Fecha original de la aplicación. No se puede modificar.'
              : 'Fecha automática del sistema (Guatemala). No se puede modificar.'
          }
          error={errorFor(
            'fechaAplicacion',
            fechaAplicacion,
          )}
        />

        <TextInput
          label="Monto aplicado"
          type="number"
          restriction="decimal"
          decimalPlaces={2}
          min={0.01}
          max={
            Number.isFinite(maxAplicable) && !isEditing
              ? maxAplicable
              : undefined
          }
          step="0.01"
          required
          value={montoAplicado}
          onChange={(e: any) =>
            setMonto(e.target.value)
          }
          helperText={
            Number.isFinite(maxAplicable) && !isEditing
              ? `Máximo aplicable: Q ${maxAplicable.toFixed(2)} (menor entre disponible del anticipo y saldo del documento).`
              : 'Mayor a 0, máximo 2 decimales.'
          }
          error={errorFor(
            'montoAplicado',
            montoAplicado,
          )}
        />
      </div>

      {anticipoSeleccionado && documentoSeleccionado && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">
            ¿De dónde sale el máximo?
          </p>

          <ul className="mt-1 space-y-0.5">
            <li>
              Anticipo: original Q{' '}
              {Number(
                anticipoSeleccionado.monto ??
                anticipoSeleccionado.saldo,
              ).toFixed(2)}

              {anticipoSeleccionado.monto !== undefined &&
                Number(anticipoSeleccionado.monto) >
                  Number(anticipoSeleccionado.saldo)
                ? `, ya aplicado Q ${(
                    Number(anticipoSeleccionado.monto) -
                    Number(anticipoSeleccionado.saldo)
                  ).toFixed(2)}`
                : ''}

              {' '}→{' '}
              <strong>
                disponible Q{' '}
                {Number(
                  anticipoSeleccionado.saldo,
                ).toFixed(2)}
              </strong>
            </li>

            <li>
              Saldo pendiente del documento:{' '}
              <strong>
                Q{' '}
                {Number(
                  documentoSeleccionado.saldo,
                ).toFixed(2)}
              </strong>
            </li>

            <li>
              Se puede aplicar como máximo el menor de los dos:{' '}
              <strong>
                Q {maxAplicable.toFixed(2)}
              </strong>.

              {Number(documentoSeleccionado.saldo) >
              maxAplicable
                ? ` El documento quedará con saldo Q ${(
                    Number(documentoSeleccionado.saldo) -
                    maxAplicable
                  ).toFixed(2)}, que se cobra con otro pago.`
                : ''}
            </li>
          </ul>
        </div>
      )}

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
        createLabel="Guardar aplicación"
      />
    </form>
  );
}
