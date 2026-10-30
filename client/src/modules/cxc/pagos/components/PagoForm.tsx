
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
  ResumenMoraCliente,
} from '@erp/contracts';
import { AlertTriangle } from 'lucide-react';
import { toast } from '../../../../shared/components/Toast';

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

  // El banco solo aplica a medios con referencia bancaria (REQUIERE_REFERENCIA = S en
  // CXC_FORMAS_PAGO: cheque, depósito, transferencia, tarjeta); en efectivo queda bloqueado.
  const usaBanco = Boolean(formas.find((f) => String(f.id) === idFormaPago)?.requiereReferencia);

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

  // Destino del pago nuevo: repartirlo entre facturas del cliente o registrarlo
  // como anticipo (aún no hay factura). Vacío = todavía no se eligió.
  const [destino, setDestino] = useState<'' | 'FACTURAS' | 'ANTICIPO'>('');
  const [documentos, setDocumentos] = useState<CatalogoOption[]>([]);
  const [cargandoDocumentos, setCargandoDocumentos] = useState(false);
  // Monto a aplicar a cada factura (id del documento → monto escrito).
  const [montosPorDocumento, setMontosPorDocumento] = useState<Record<string, string>>({});
  // Anticipos que el cliente ya tiene disponibles (para no cobrar dos veces).
  const [anticiposDisponibles, setAnticiposDisponibles] = useState(0);
  // Mora del cliente (notas de débito pendientes y recargo aún no emitido).
  const [moraCliente, setMoraCliente] = useState<ResumenMoraCliente | null>(null);
  const moraTotal = moraCliente ? moraCliente.moraPendiente + moraCliente.moraPorEmitir : 0;

  const aplicaciones = documentos
    .map((d) => ({ documento: d, monto: Number(montosPorDocumento[String(d.id)] || 0) }))
    .filter((a) => a.monto > 0);
  const totalAplicado = Math.round(aplicaciones.reduce((s, a) => s + a.monto, 0) * 100) / 100;
  // La moneda la fija la primera factura elegida; las de otra moneda no se mezclan.
  const monedaFacturas = aplicaciones[0]?.documento.idMoneda;
  const montoFinal = destino === 'FACTURAS' ? totalAplicado.toFixed(2) : monto;

  // Alta: referencia que recibirá el pago (vista previa calculada en la base).
  const [referenciaPrevia, setReferenciaPrevia] = useState('');

  const numeroReferencia =
    pago?.numeroReferencia ?? referenciaPrevia;

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
      // Alta: solo clientes con documentos pendientes de pago. Al editar se
      // usa el catálogo completo porque el cliente del pago ya pudo quedar al día.
      apiClient.get<CatalogoOption[]>(
        isEditing ? '/cxc/catalogos/clientes' : '/cxc/catalogos/clientes?conSaldo=1',
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
  }, [isEditing]);

  // =====================================================
  // REFERENCIA PREVIA Y DOCUMENTOS DEL CLIENTE (ALTA)
  // =====================================================

  useEffect(() => {
    if (isEditing) return;
    apiClient
      .get<{ numeroReferencia: string }>('/cxc/pagos/siguiente-referencia')
      .then((data) => setReferenciaPrevia(data.numeroReferencia))
      .catch(() => setReferenciaPrevia(''));
  }, [isEditing]);

  useEffect(() => {
    setDestino('');
    setDocumentos([]);
    setMontosPorDocumento({});
    setAnticiposDisponibles(0);
    setMoraCliente(null);
    if (isEditing || !idCliente) return;

    let activo = true;
    const cliente = encodeURIComponent(idCliente);
    setCargandoDocumentos(true);
    Promise.all([
      apiClient.get<CatalogoOption[]>(`/cxc/catalogos/clientes/${cliente}/documentos-pendientes`),
      apiClient.get<CatalogoOption[]>(`/cxc/catalogos/clientes/${cliente}/anticipos-disponibles`),
      apiClient.get<ResumenMoraCliente>(`/cxc/mora/cliente/${cliente}`).catch(() => null),
    ])
      .then(([docs, anticipos, mora]) => {
        if (!activo) return;
        setDocumentos(docs);
        setAnticiposDisponibles(anticipos.reduce((s, a) => s + Number(a.saldo ?? 0), 0));
        if (docs.length) setDestino('FACTURAS');
        setMoraCliente(mora);
        // Aviso flotante para quien recibe el pago: el cliente tiene recargos por atraso.
        if (mora && mora.moraPendiente + mora.moraPorEmitir > 0.005) {
          toast.error(`Atención: el cliente debe Q ${(mora.moraPendiente + mora.moraPorEmitir).toFixed(2)} de mora por ${mora.diasMaxMora} día(s) de atraso.`);
        }
      })
      .catch(() => { if (activo) setDocumentos([]); })
      .finally(() => { if (activo) setCargandoDocumentos(false); });

    return () => {
      activo = false;
    };
  }, [idCliente, isEditing]);

  // La moneda del pago es la de las facturas elegidas.
  useEffect(() => {
    if (destino === 'FACTURAS' && monedaFacturas) setIdMoneda(String(monedaFacturas));
  }, [destino, monedaFacturas]);

  const cambiarMontoDocumento = (idDoc: number, valor: string) =>
    setMontosPorDocumento((prev) => ({ ...prev, [String(idDoc)]: valor }));

  /** Reparte un monto entre las facturas, de la más antigua a la más nueva. */
  const repartir = (total: number) => {
    let restante = Math.round(total * 100);
    const siguiente: Record<string, string> = {};
    for (const d of documentos) {
      if (monedaFacturas && d.idMoneda !== monedaFacturas) continue;
      const saldo = Math.round(Number(d.saldo ?? 0) * 100);
      const parte = Math.min(saldo, restante);
      if (parte > 0) siguiente[String(d.id)] = (parte / 100).toFixed(2);
      restante -= parte;
    }
    setMontosPorDocumento(siguiente);
  };

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

    if (destino === 'FACTURAS') {
      if (aplicaciones.length === 0) {
        next.aplicaciones = 'Escribe cuánto se paga de al menos una factura.';
      }
      for (const a of aplicaciones) {
        const etiqueta = a.documento.label.split(' · ')[0];
        const err = validateMoney(montosPorDocumento[String(a.documento.id)], `El monto de ${etiqueta}`, { required: true, positive: true });
        if (err) next.aplicaciones = err;
        else if (a.monto > Number(a.documento.saldo ?? 0) + 0.005) {
          next.aplicaciones = `${etiqueta}: no se puede pagar más que su saldo (Q ${Number(a.documento.saldo ?? 0).toFixed(2)}).`;
        } else if (monedaFacturas && a.documento.idMoneda !== monedaFacturas) {
          next.aplicaciones = 'Las facturas de un mismo pago deben ser de la misma moneda.';
        }
      }
    } else {
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
    }

    if (!isEditing && idCliente && !destino) {
      next.destino = 'Indica si el pago es para facturas pendientes o un anticipo.';
    }

    if (
      isEditing &&
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
    isEditing,
    destino,
    aplicaciones,
    montosPorDocumento,
    monedaFacturas,
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
      // Sin banco cuando la forma de pago no lo usa (también limpia un banco viejo en efectivo).
      idBanco: usaBanco && idBanco
        ? Number(idBanco)
        : null,
      monto: Number(montoFinal),
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
            // El servidor registra el pago y su destino en una sola transacción.
            estado: 'NO_APLICADO',
            ...(destino === 'FACTURAS'
              ? { aplicaciones: aplicaciones.map((a) => ({ idDocumento: Number(a.documento.id), montoAplicado: a.monto })) }
              : { comoAnticipo: true }),
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
      {!isEditing && moraCliente && moraTotal > 0.005 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              El cliente debe Q {moraTotal.toFixed(2)} de mora por {moraCliente.diasMaxMora} día(s) de atraso.
            </p>
            <p className="mt-0.5">
              {moraCliente.moraPendiente > 0.005 && (
                <>Tiene {moraCliente.notasPendientes} nota(s) de débito por mora pendientes por Q {moraCliente.moraPendiente.toFixed(2)}; aparecen en la lista de facturas para cobrarlas. </>
              )}
              {moraCliente.moraPorEmitir > 0.005 && (
                <>Q {moraCliente.moraPorEmitir.toFixed(2)} se cargarán en la próxima nota de débito. </>
              )}
              Infórmale al cliente antes de registrar el pago.
            </p>
          </div>
        </div>
      )}

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
          helperText={isEditing ? "Cliente al que pertenece el pago." : clientes.length === 0 ? "No hay clientes con documentos pendientes de pago." : "Solo clientes con facturas o cargos pendientes, con lo que deben en total."}
          error={errorFor('idCliente')}
          isReadOnly={isLocked}
        />

        <Select
          label="Forma de pago"
          required
          value={idFormaPago}
          onChange={(e: any) => {
            setIdFormaPago(e.target.value);
            // Un medio sin referencia bancaria (efectivo) no lleva banco.
            if (!formas.find((f) => String(f.id) === e.target.value)?.requiereReferencia) setIdBanco('');
          }}
          options={formas.map((x) => ({
            value: x.id,
            label: x.label,
          }))}
          helperText="Medio con el que se recibió el pago."
          error={errorFor('idFormaPago')}
          isReadOnly={isLocked}
        />
      </div>

      {!isEditing && idCliente && !cargandoDocumentos && (
        <div className="flex flex-col gap-3">
          {anticiposDisponibles > 0.005 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Este cliente tiene <strong>Q {anticiposDisponibles.toFixed(2)}</strong> en anticipos disponibles.
              Si va a pagar con ese dinero, úsalo en <strong>Aplicación de anticipo</strong>; no registres un pago nuevo por el mismo dinero.
            </p>
          )}

          <Select
            label="El pago es para"
            required
            value={destino}
            onChange={(e: any) => { setDestino(e.target.value); setMontosPorDocumento({}); }}
            options={[
              ...(documentos.length ? [{ value: 'FACTURAS', label: `Facturas pendientes (${documentos.length})` }] : []),
              { value: 'ANTICIPO', label: 'Anticipo: el cliente aún no tiene factura' },
            ]}
            error={errors.destino}
            helperText={destino === 'ANTICIPO'
              ? 'Se registran el pago y el anticipo juntos; el anticipo se usa cuando se emita la factura.'
              : 'El pago se aplica a las facturas que indiques; puedes repartirlo entre varias.'}
          />

          {destino === 'FACTURAS' && (
            <div className="rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">Facturas del cliente</span>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">Repartir</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Monto recibido"
                    aria-label="Monto a repartir entre las facturas"
                    className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); repartir(Number((e.target as HTMLInputElement).value || 0)); } }}
                    onBlur={(e) => { if (e.target.value) repartir(Number(e.target.value)); }}
                  />
                  <span className="text-slate-500">de la más antigua a la más nueva</span>
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {documentos.map((d) => {
                  const otraMoneda = Boolean(monedaFacturas && d.idMoneda !== monedaFacturas);
                  const valor = montosPorDocumento[String(d.id)] ?? '';
                  return (
                    <li key={d.id} className={`flex flex-wrap items-center gap-3 px-3 py-2 text-sm ${otraMoneda ? 'opacity-50' : ''}`}>
                      <span className="min-w-0 flex-1">{d.label}</span>
                      <button
                        type="button"
                        className="text-xs font-medium text-blue-700 hover:underline disabled:no-underline"
                        disabled={otraMoneda}
                        onClick={() => cambiarMontoDocumento(Number(d.id), Number(d.saldo ?? 0).toFixed(2))}
                      >
                        Pagar todo
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={String(d.saldo ?? '')}
                        value={valor}
                        disabled={otraMoneda}
                        onChange={(e) => cambiarMontoDocumento(Number(d.id), e.target.value)}
                        placeholder="0.00"
                        aria-label={`Monto a pagar de ${d.label}`}
                        className="w-32 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums"
                      />
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-600">{aplicaciones.length} factura(s) · se emite un recibo por cada una</span>
                <span>Total del pago: <strong className="tabular-nums">Q {totalAplicado.toFixed(2)}</strong></span>
              </div>
              {(errors.aplicaciones ?? (aplicaciones.length ? validationErrors.aplicaciones : undefined)) && (
                <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errors.aplicaciones ?? validationErrors.aplicaciones}
                </p>
              )}
            </div>
          )}
        </div>
      )}

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
          helperText={destino === 'FACTURAS' ? 'Moneda de las facturas seleccionadas.' : 'Selecciona una moneda del catálogo maestro.'}
          error={errorFor('idMoneda')}
          isReadOnly={isLocked || (destino === 'FACTURAS' && Boolean(monedaFacturas))}
        />

        <Select
          label="Banco"
          placeholder={usaBanco ? 'Ninguno (opcional)' : 'No aplica'}
          value={idBanco}
          onChange={(e: any) =>
            setIdBanco(e.target.value)
          }
          options={bancos.map((x) => ({
            value: x.id,
            label: x.label,
          }))}
          helperText={usaBanco
            ? 'Banco del cheque, depósito, transferencia o tarjeta.'
            : idFormaPago ? 'Esta forma de pago no se recibe por un banco.' : 'Selecciona primero la forma de pago.'}
          error={errorFor('idBanco')}
          isReadOnly={isLocked || !usaBanco}
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
          value={montoFinal}
          onChange={(e: any) =>
            setMonto(e.target.value)
          }
          helperText={destino === 'FACTURAS'
            ? 'Suma de lo que se paga de cada factura.'
            : 'Monto recibido; mayor a 0 y máximo 2 decimales.'}
          error={errorFor('monto', monto)}
          isReadOnly={isLocked || destino === 'FACTURAS'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <TextInput
          label="Número de referencia"
          value={numeroReferencia || 'Calculando...'}
          isReadOnly
          helperText={isEditing
            ? 'Correlativo asignado al pago; no se edita.'
            : 'Siguiente correlativo del sistema. Si otro usuario guarda antes, al guardar se toma el siguiente libre.'}
        />

        {isEditing && (
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
        )}
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
