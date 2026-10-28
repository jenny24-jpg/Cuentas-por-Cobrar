import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select, TextArea } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  BUSINESS_DATE_MAX,
  hasErrors,
  todayIso,
  sanitizeSoloLetras,
  validateIdentifier,
  validateMaxLength,
  validateRequired,
  validateRequiredDate,
  validateRequiredSelect,
  validateSoloLetras,
  validateTextOnly,
  type ValidationErrors,
} from '../../../../shared/validation';
import { TriangleAlert } from 'lucide-react';
import { REGLAS_RUTA, TRANSICIONES_RUTA, JORNADA_COBRADOR, esDiaDeVisita, mensajeDiaDescanso, type CatalogoOption, type PaginatedResponse, type Ruta } from '@erp/contracts';

const ETIQUETA_ESTADO: Record<string, string> = {
  PLANIFICADA: 'Planificada', EN_PROCESO: 'En proceso', COMPLETADA: 'Completada', CANCELADA: 'Cancelada',
};

interface RutaFormProps {
  ruta?: Ruta | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const RutaForm = ({ ruta, onSuccess, onCancel }: RutaFormProps) => {
  const isEditing = Boolean(ruta);
  const [empleados, setEmpleados] = useState<CatalogoOption[]>([]);
  const [codigoRuta, setCodigoRuta] = useState(ruta?.codigoRuta ?? '');
  const [nombre, setNombre] = useState(ruta?.nombre ?? '');
  const [idEmpleado, setIdEmpleado] = useState(ruta?.idEmpleado?.toString() ?? '');
  const fechaOriginal = ruta?.fecha?.slice(0, 10) ?? '';
  const [fecha, setFecha] = useState(fechaOriginal);
  const [radioKm, setRadioKm] = useState(String(ruta?.radioKm ?? REGLAS_RUTA.radioKmDefecto));
  const [otrasRutas, setOtrasRutas] = useState<Ruta[]>([]);
  const [estado, setEstado] = useState(ruta?.estado ?? 'PLANIFICADA');
  const [observaciones, setObservaciones] = useState(ruta?.observaciones ?? '');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<CatalogoOption[]>('/cxc/catalogos/empleados').then(setEmpleados).catch(() => setEmpleados([]));
  }, []);

  // Aviso (no bloquea): el cobrador ya tiene otra ruta ese mismo día.
  useEffect(() => {
    setOtrasRutas([]);
    if (!idEmpleado || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    const controller = new AbortController();
    const q = new URLSearchParams({ idEmpleado, fecha, limit: '20', ...(ruta ? { excluirId: String(ruta.idRuta) } : {}) });
    apiClient.get<PaginatedResponse<Ruta>>(`/cxc/rutas?${q}`, { signal: controller.signal })
      .then((r) => setOtrasRutas(r.data.filter((x) => x.estado !== 'CANCELADA')))
      .catch(() => undefined);
    return () => controller.abort();
  }, [idEmpleado, fecha, ruta]);

  // Estados a los que puede pasar la ruta desde el actual (una ruta nueva siempre es Planificada).
  const estadoOptions = (isEditing ? TRANSICIONES_RUTA[ruta!.estado] ?? [ruta!.estado] : ['PLANIFICADA'])
    .map((e) => ({ value: e, label: ETIQUETA_ESTADO[e] ?? e }));

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};
    if (codigoRuta) {
      const codeErr = validateIdentifier(codigoRuta, 'El código de ruta');
      if (codeErr) next.codigoRuta = codeErr;
    }
    const nameErr = validateRequired(nombre, 'El nombre');
    if (nameErr) next.nombre = nameErr;
    const nameMax = validateMaxLength(nombre, 'El nombre', 120);
    if (nameMax) next.nombre = nameMax;
    const nameLetras = validateSoloLetras(nombre, 'El nombre');
    if (nameLetras) next.nombre = nameLetras;
    const empErr = validateRequiredSelect(idEmpleado, 'un empleado responsable');
    if (empErr) next.idEmpleado = empErr;
    const dateErr = validateRequiredDate(fecha, 'La fecha planificada', { maxDate: BUSINESS_DATE_MAX });
    if (dateErr) next.fecha = dateErr;
    // Solo se valida contra hoy si la fecha es nueva o cambió: una ruta en curso conserva la suya.
    else if (fecha !== fechaOriginal) {
      if (fecha < todayIso()) next.fecha = 'La fecha planificada no puede ser anterior a hoy.';
      else if (!esDiaDeVisita(fecha)) next.fecha = mensajeDiaDescanso(fecha);
    }
    const radio = Number(radioKm);
    if (!radioKm || !Number.isFinite(radio) || radio < REGLAS_RUTA.radioKmMinimo || radio > REGLAS_RUTA.radioKmMaximo) {
      next.radioKm = `El radio debe estar entre ${REGLAS_RUTA.radioKmMinimo} y ${REGLAS_RUTA.radioKmMaximo} km.`;
    }
    const observacionesErr = validateTextOnly(observaciones, 'Las observaciones', { required: true, minLength: 1, maxLength: 500 });
    if (observacionesErr) next.observaciones = observacionesErr;
    return next;
  }, [codigoRuta, nombre, idEmpleado, fecha, fechaOriginal, radioKm, observaciones]);

  const isFormValid = !hasErrors(validationErrors);

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
      codigoRuta: codigoRuta.trim().toUpperCase() || undefined,
      nombre: nombre.trim(),
      idEmpleado: Number(idEmpleado),
      fecha: fecha || undefined,
      ...(isEditing && estado === ruta!.estado ? {} : { estado }),
      radioKm: Number(radioKm),
      observaciones: observaciones.trim() || undefined,
    };

    try {
      if (isEditing) await apiClient.patch(`/cxc/rutas/${ruta!.idRuta}`, payload);
      else await apiClient.post('/cxc/rutas', payload);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {};
        (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => {
          fieldErrors[d.campo] = d.mensaje;
        });
        setErrors(fieldErrors);
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
        <TextInput
          label="Código de ruta"
          restriction="identifier"
          uppercase
          maxLength={20}
          value={codigoRuta}
          onChange={(e: any) => setCodigoRuta(e.target.value)}
          error={errors.codigoRuta ?? (codigoRuta ? validationErrors.codigoRuta : undefined)}
          helperText="Código corto; admite letras, números, -, _ y /."
          placeholder="Ej. RT-001"
        />
        <TextInput
          label="Nombre"
          required
          maxLength={120}
          value={nombre}
          onChange={(e: any) => setNombre(sanitizeSoloLetras(e.target.value))}
          error={errors.nombre ?? (nombre ? validationErrors.nombre : undefined)}
          helperText="Solo letras y espacios, sin números ni signos; máximo 120 caracteres."
          placeholder="Ej. Ruta Centro Miércoles"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Empleado responsable"
          required
          value={idEmpleado}
          onChange={(e: any) => setIdEmpleado(e.target.value)}
          options={empleados.map((e) => ({ value: e.id, label: e.label }))}
          helperText="Empleado asignado a la ruta."
          error={errors.idEmpleado}
        />
        <TextInput
          label="Fecha planificada"
          type="date"
          required
          min={fecha && fecha === fechaOriginal && fechaOriginal < todayIso() ? fechaOriginal : todayIso()}
          max={BUSINESS_DATE_MAX}
          value={fecha}
          onChange={(e: any) => setFecha(e.target.value)}
          error={errors.fecha ?? (fecha ? validationErrors.fecha : undefined)}
          helperText={`De hoy en adelante, en la jornada del cobrador: ${JORNADA_COBRADOR}. Sábado y domingo son de descanso.`}
        />
      </div>

      {otrasRutas.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Este cobrador ya tiene {otrasRutas.length === 1 ? 'otra ruta' : `${otrasRutas.length} rutas`} ese día: {otrasRutas.map((r) => r.codigoRuta ?? r.nombre).join(', ')}. Verifica que pueda cubrirlas.</span>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Estado"
          required
          value={estado}
          onChange={(e: any) => setEstado(e.target.value)}
          options={estadoOptions}
          isReadOnly={!isEditing}
          helperText={isEditing
            ? 'Completada exige que ninguna parada quede pendiente. La primera visita o cobro la pone En proceso.'
            : 'Toda ruta nueva inicia Planificada.'}
        />
        <TextInput
          label="Área de la ruta (km)"
          type="number"
          restriction="decimal"
          decimalPlaces={1}
          step="0.5"
          min={String(REGLAS_RUTA.radioKmMinimo)}
          max={String(REGLAS_RUTA.radioKmMaximo)}
          required
          value={radioKm}
          onChange={(e: any) => setRadioKm(e.target.value)}
          error={errors.radioKm ?? validationErrors.radioKm}
          helperText={`Distancia máxima de cada parada a la primera. Recomendado ${REGLAS_RUTA.radioKmDefecto} km en ciudad.`}
        />
      </div>

      <TextArea
        label="Observaciones"
        required
        maxLength={500}
        helperText="Obligatorias: solo letras y espacios; máximo 500 caracteres."
        value={observaciones}
        onChange={(e: any) => setObservaciones(e.target.value)}
        rows={3}
        error={errors.observaciones}
      />

      {formError && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <FormActionButtons
        onCancel={onCancel}
        isSubmitting={isSubmitting}
        isEditing={isEditing}
        isFormValid={isFormValid} blockers={validationErrors}
        createLabel="Crear ruta"
      />
    </form>
  );
};