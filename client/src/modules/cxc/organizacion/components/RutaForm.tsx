import React, { useEffect, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  TextInput,
  Select,
  TextArea,
} from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import { useSucursales } from '../../../../shared/hooks';
import {
  BUSINESS_DATE_MAX,
  hasErrors,
  todayIso,
  sanitizeSoloLetras,
  validateMaxLength,
  validateRequired,
  validateRequiredDate,
  validateRequiredSelect,
  validateSoloLetras,
  validateTextOnly,
  type ValidationErrors,
} from '../../../../shared/validation';
import {
  REGLAS_RUTA,
  JORNADA_COBRADOR,
  esDiaDeVisita,
  mensajeDiaDescanso,
  type CatalogoOption,
  type PaginatedResponse,
  type Ruta,
  type SugerenciaSucursalRuta,
  type ZonaCobro,
} from '@erp/contracts';

const ETIQUETA_ESTADO: Record<string, string> = {
  PLANIFICADA: 'Planificada',
  EN_PROCESO: 'En proceso',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

interface RutaFormProps {
  ruta?: Ruta | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const RutaForm = ({ ruta, onSuccess, onCancel }: RutaFormProps) => {
  const isEditing = Boolean(ruta);
  const sucursales = useSucursales();
  const [empleados, setEmpleados] = useState<CatalogoOption[]>([]);
  const [idSucursal, setIdSucursal] = useState(ruta?.idSucursal?.toString() ?? '');
  const [sugerencia, setSugerencia] = useState<SugerenciaSucursalRuta | null>(null);
  const [nombre, setNombre] = useState(ruta?.nombre ?? '');
  const [idEmpleado, setIdEmpleado] = useState(ruta?.idEmpleado?.toString() ?? '');
  const fechaOriginal = ruta?.fecha?.slice(0, 10) ?? '';
  const [fecha, setFecha] = useState(fechaOriginal);
  const [radioKm, setRadioKm] = useState(String(ruta?.radioKm ?? REGLAS_RUTA.radioKmDefecto));
  const [idZona, setIdZona] = useState(ruta?.idZona?.toString() ?? '');
  const [zonas, setZonas] = useState<ZonaCobro[]>([]);
  const [otrasRutas, setOtrasRutas] = useState<Ruta[]>([]);
  const [observaciones, setObservaciones] = useState(ruta?.observaciones ?? '');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // El estado se consulta, nunca se cambia mediante PATCH.
  const estadoActual = ruta?.estado ?? 'PLANIFICADA';
  const estadoLegible = ETIQUETA_ESTADO[estadoActual] ?? estadoActual;

  useEffect(() => {
    apiClient.get<CatalogoOption[]>('/cxc/catalogos/empleados')
      .then(setEmpleados)
      .catch(() => setEmpleados([]));
    apiClient.get<ZonaCobro[]>('/cxc/catalogos/zonas-cobro')
      .then(setZonas)
      .catch(() => setZonas([]));
  }, []);

  // Zonas que puede atender la sucursal elegida (las que no tienen sucursal sirven a cualquiera).
  const zonasDeLaSucursal = zonas.filter((z) => !z.idSucursal || !idSucursal || String(z.idSucursal) === idSucursal);

  useEffect(() => {
    if (!ruta) {
      setSugerencia(null);
      return;
    }
    let activo = true;
    apiClient.get<SugerenciaSucursalRuta>(`/cxc/rutas/${ruta.idRuta}/sucursal-sugerida`)
      .then((resultado) => { if (activo) setSugerencia(resultado); })
      .catch(() => { if (activo) setSugerencia(null); });
    return () => { activo = false; };
  }, [ruta?.idRuta]);

  const empleadosDeLaSucursal = idSucursal
    ? empleados.filter((empleado) => String(empleado.idSucursal ?? '') === idSucursal)
    : [];

  const textoSugerencia = (() => {
    if (!sugerencia) return null;
    if (!sugerencia.sugerida) return sugerencia.motivo;
    const { nombre: nombreSucursal, distanciaKm, idSucursal: idSugerida } = sugerencia.sugerida;
    const coincide = String(idSugerida) === idSucursal;
    return `Sucursal más cercana a la primera parada: ${nombreSucursal} (${distanciaKm} km)${coincide ? ', la que tienes elegida.' : '. Es solo una sugerencia.'}`;
  })();

  useEffect(() => {
    setOtrasRutas([]);
    if (!idEmpleado || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    const controller = new AbortController();
    const q = new URLSearchParams({
      idEmpleado,
      fecha,
      limit: '20',
      ...(ruta ? { excluirId: String(ruta.idRuta) } : {}),
    });
    apiClient.get<PaginatedResponse<Ruta>>(`/cxc/rutas?${q}`, { signal: controller.signal })
      .then((resultado) => {
        if (!controller.signal.aborted) {
          setOtrasRutas(resultado.data.filter((item) => item.estado !== 'CANCELADA'));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [idEmpleado, fecha, ruta?.idRuta]);

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};
    const sucErr = validateRequiredSelect(idSucursal, 'una sucursal');
    if (sucErr) next.idSucursal = sucErr;

    // Obligatoria en rutas nuevas; una ruta anterior a las zonas puede guardarse sin ella.
    const zonaErr = isEditing && !ruta?.idZona && !idZona ? null : validateRequiredSelect(idZona, 'la zona de cobro');
    if (zonaErr) next.idZona = zonaErr;

    const nameErr = validateRequired(nombre, 'El nombre')
      ?? validateMaxLength(nombre, 'El nombre', 120)
      ?? validateSoloLetras(nombre, 'El nombre');
    if (nameErr) next.nombre = nameErr;

    const empErr = validateRequiredSelect(idEmpleado, 'un empleado responsable');
    if (empErr) next.idEmpleado = empErr;
    else if (idSucursal && !empleadosDeLaSucursal.some((e) => String(e.id) === idEmpleado)) {
      // Evitar falsos positivos mientras se carga el catalogo.
      if (empleados.length > 0) next.idEmpleado = 'El empleado no pertenece a la sucursal seleccionada.';
    }

    const dateErr = validateRequiredDate(fecha, 'La fecha planificada', { maxDate: BUSINESS_DATE_MAX });
    if (dateErr) next.fecha = dateErr;
    else if (fecha !== fechaOriginal) {
      if (fecha < todayIso()) next.fecha = 'La fecha planificada no puede ser anterior a hoy.';
      else if (!esDiaDeVisita(fecha)) next.fecha = mensajeDiaDescanso(fecha);
    }

    const radio = Number(radioKm);
    if (!radioKm || !Number.isFinite(radio) || radio < REGLAS_RUTA.radioKmMinimo || radio > REGLAS_RUTA.radioKmMaximo) {
      next.radioKm = `El radio debe estar entre ${REGLAS_RUTA.radioKmMinimo} y ${REGLAS_RUTA.radioKmMaximo} km.`;
    }
    const obsErr = validateTextOnly(observaciones, 'Las observaciones', { required: true, minLength: 1, maxLength: 500 });
    if (obsErr) next.observaciones = obsErr;
    return next;
  }, [idSucursal, idZona, idEmpleado, empleados, nombre, fecha, fechaOriginal, radioKm, observaciones]);

  const isFormValid = !hasErrors(validationErrors);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    if (!isFormValid) { setErrors(validationErrors); return; }
    setErrors({});
    setIsSubmitting(true);

    // El codigo de ruta lo genera el servidor (develop).
    // El estado cambia solo al operar o finalizar la ruta (galeano).
    const payload = {
      nombre: nombre.trim(),
      idSucursal: Number(idSucursal),
      idEmpleado: Number(idEmpleado),
      fecha,
      radioKm: Number(radioKm),
      observaciones: observaciones.trim() || undefined,
      ...(idZona ? { idZona: Number(idZona) } : {}),
    };
    try {
      if (isEditing && ruta) {
        await apiClient.patch(`/cxc/rutas/${ruta.idRuta}`, payload);
      } else {
        await apiClient.post('/cxc/rutas', { ...payload, estado: 'PLANIFICADA' });
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {};
        (err.details as Array<{ campo?: string; mensaje?: string }>).forEach((detail) => {
          if (detail.campo && detail.mensaje) fieldErrors[detail.campo] = detail.mensaje;
        });
        if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
        else setFormError(err.message);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar la ruta');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput label="Codigo de ruta" isReadOnly disabled value={ruta?.codigoRuta ?? ''}
          placeholder="Se asigna automáticamente (RUT-###)"
          helperText="Lo genera el sistema y no se puede cambiar." />
        <TextInput label="Nombre" required maxLength={120} value={nombre}
          onChange={(e: any) => setNombre(sanitizeSoloLetras(e.target.value))}
          error={errors.nombre ?? (nombre ? validationErrors.nombre : undefined)}
          helperText="Solo letras y espacios, sin números ni signos; máximo 120 caracteres."
          placeholder="Ej. Ruta Centro Miércoles" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label="Sucursal" required value={idSucursal} onChange={(e: any) => {
          const nueva = String(e.target.value);
          setIdSucursal(nueva);
          if (idEmpleado && !empleados.some((x) => String(x.id) === idEmpleado && String(x.idSucursal ?? '') === nueva)) {
            setIdEmpleado('');
          }
          if (idZona && zonas.some((z) => String(z.id) === idZona && z.idSucursal && String(z.idSucursal) !== nueva)) {
            setIdZona('');
          }
        }} options={sucursales.map((s) => ({ value: String(s.id), label: s.nombre }))}
          placeholder="Selecciona una sucursal"
          helperText={textoSugerencia ?? 'Sucursal que se encarga del cobro de esta ruta.'}
          error={errors.idSucursal ?? validationErrors.idSucursal} />
        <Select label="Empleado responsable" required value={idEmpleado}
          onChange={(e: any) => setIdEmpleado(e.target.value)}
          options={empleadosDeLaSucursal.map((empleado) => ({ value: String(empleado.id), label: empleado.label }))}
          placeholder={idSucursal ? 'Selecciona un empleado' : 'Elige primero la sucursal'}
          isReadOnly={!idSucursal}
          helperText={idSucursal
            ? (empleadosDeLaSucursal.length ? 'Solo se muestran los empleados de la sucursal elegida.' : 'Esta sucursal no tiene empleados. Asígnalos en Usuarios y accesos → Empleados.')
            : 'Selecciona primero la sucursal.'}
          error={errors.idEmpleado ?? validationErrors.idEmpleado} />
        <Select label="Zona de cobro" required value={idZona} onChange={(e: any) => setIdZona(e.target.value)}
          options={zonasDeLaSucursal.map((z) => ({ value: String(z.id), label: z.zona ? z.nombre : `${z.nombre} (todo el municipio)` }))}
          placeholder="Selecciona la zona"
          helperText={zonas.length === 0
            ? 'No hay zonas de cobro registradas en la base. Solicita al equipo DBA que las cargue.'
            : 'Territorio de la ruta: al asignar documentos solo aparecen los clientes de esta zona.'}
          error={errors.idZona ?? validationErrors.idZona} />
        <TextInput label="Fecha planificada" type="date" required
          min={fecha && fecha === fechaOriginal && fechaOriginal < todayIso() ? fechaOriginal : todayIso()}
          max={BUSINESS_DATE_MAX} value={fecha}
          onChange={(e: any) => setFecha(e.target.value)}
          error={errors.fecha ?? (fecha ? validationErrors.fecha : undefined)}
          helperText={`De hoy en adelante, en la jornada del cobrador: ${JORNADA_COBRADOR}. Sábado y domingo son de descanso.`} />
      </div>

      {otrasRutas.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Este cobrador ya tiene {otrasRutas.length === 1 ? 'otra ruta' : `${otrasRutas.length} rutas`} ese día: {' '}
            {otrasRutas.map((item) => item.codigoRuta ?? item.nombre).join(', ')}. Verifica que pueda cubrirlas.</span>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput label="Estado de la ruta" type="text" value={estadoLegible} isReadOnly
          helperText={isEditing
            ? 'Estado automático. La primera visita o cobro inicia la ruta; usa Finalizar ruta para completarla.'
            : 'Toda ruta nueva inicia Planificada.'} />
        <TextInput label="Área de la ruta (km)" type="number" restriction="decimal" decimalPlaces={1} step="0.5"
          min={String(REGLAS_RUTA.radioKmMinimo)} max={String(REGLAS_RUTA.radioKmMaximo)} required
          value={radioKm} onChange={(e: any) => setRadioKm(e.target.value)}
          error={errors.radioKm ?? validationErrors.radioKm}
          helperText={`Distancia máxima de cada parada a la primera. Recomendado ${REGLAS_RUTA.radioKmDefecto} km en ciudad.`} />
      </div>

      <TextArea label="Observaciones" required maxLength={500}
        helperText="Obligatorias: solo letras y espacios; máximo 500 caracteres."
        value={observaciones} onChange={(e: any) => setObservaciones(e.target.value)} rows={3}
        error={errors.observaciones ?? (observaciones ? validationErrors.observaciones : undefined)} />

      {formError && <p role="alert" className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
      <FormActionButtons onCancel={onCancel} isSubmitting={isSubmitting} isEditing={isEditing}
        isFormValid={isFormValid} blockers={validationErrors} createLabel="Crear ruta" />
    </form>
  );
};
