import React, { useEffect, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { TextInput, Select } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  hasErrors,
  validateGuatemalaNit,
  validateRequiredSelect,
  type ValidationErrors,
} from '../../../../shared/validation';
import { esNitValido, normalizarNit, type Cliente, type DocumentoCatalogoOption } from '@erp/contracts';

const ESTADOS_CLIENTE = [
  { value: 'A', label: 'Activo' },
  { value: 'I', label: 'Inactivo' },
];

const NOMBRE_VALIDO = /^[\p{L}\p{N}][\p{L}\p{N}\s.,:'’\-_/#+&()]*$/u;

interface ClienteFormProps {
  /** Sin cliente = alta de un cliente nuevo. */
  cliente?: Cliente | null;
  onSuccess: () => void;
  onCancel: () => void;
}

/** Alta y edición de cliente: nombre, NIT, condición de pago y estado. */
export const ClienteForm = ({ cliente, onSuccess, onCancel }: ClienteFormProps) => {
  const isEditing = Boolean(cliente);
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [nit, setNit] = useState(cliente?.nit ?? '');
  const [idCondicion, setIdCondicion] = useState(cliente?.idCondicion ? String(cliente.idCondicion) : '');
  const [estado, setEstado] = useState(cliente?.estado === 'I' ? 'I' : 'A');
  const [condiciones, setCondiciones] = useState<DocumentoCatalogoOption[]>([]);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/condiciones-credito')
      .then(setCondiciones)
      .catch(() => setFormError('No se pudieron cargar las condiciones de pago.'));
  }, []);

  // Si la condición actual del cliente ya no está activa, se conserva como opción para no perderla.
  const opcionesCondicion = useMemo(() => {
    const opciones = condiciones.map((c) => ({ value: String(c.id), label: c.label }));
    if (cliente?.idCondicion && !condiciones.some((c) => c.id === cliente.idCondicion) && condiciones.length) {
      opciones.unshift({ value: String(cliente.idCondicion), label: `${cliente.diasCredito ?? '?'} días crédito (condición inactiva)` });
    }
    return opciones;
  }, [condiciones, cliente]);

  // En el alta todo NIT es "nuevo" y debe ser válido; al editar, solo si se modifica.
  const nitCambio = !isEditing || normalizarNit(nit) !== normalizarNit(cliente?.nit);
  const nitHeredadoInvalido = isEditing && !nitCambio && !esNitValido(cliente?.nit);

  const validationErrors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};
    const n = nombre.trim();
    if (!n) next.nombre = 'El nombre es obligatorio.';
    else if (n.length > 200) next.nombre = 'El nombre no puede superar 200 caracteres.';
    else if (!NOMBRE_VALIDO.test(n)) next.nombre = 'El nombre contiene caracteres no permitidos.';
    else if (!/\p{L}/u.test(n)) next.nombre = 'El nombre debe contener letras.';

    if (!nit.trim()) next.nit = 'El NIT es obligatorio.';
    else if (nitCambio) {
      const nitErr = validateGuatemalaNit(nit, 'El NIT');
      if (nitErr) next.nit = nitErr;
    }

    const condErr = validateRequiredSelect(idCondicion, 'una condición de pago');
    if (condErr) next.idCondicion = condErr;
    return next;
  }, [nombre, nit, nitCambio, idCondicion]);

  const huboCambios = !isEditing ||
    nombre.trim() !== cliente!.nombre ||
    nitCambio ||
    idCondicion !== String(cliente!.idCondicion ?? '') ||
    estado !== (cliente!.estado === 'I' ? 'I' : 'A');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (hasErrors(validationErrors)) { setErrors(validationErrors); return; }
    setErrors({});
    setIsSubmitting(true);
    try {
      const payload = { nombre: nombre.trim(), nit: nit.trim().toUpperCase(), idCondicion: Number(idCondicion), estado };
      if (isEditing) await apiClient.patch(`/cxc/clientes/${cliente!.idCliente}`, payload);
      else await apiClient.post('/cxc/clientes', payload);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {};
        (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => { fieldErrors[d.campo] = d.mensaje; });
        setErrors(fieldErrors);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el cliente');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const errorFor = (campo: string, valor: string) => errors[campo] ?? (valor ? validationErrors[campo] : undefined);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {isEditing && (
        <TextInput
          label="ID Cliente"
          value={`#${cliente!.idCliente}`}
          isReadOnly
          helperText="Identificador asignado por el sistema; no se modifica."
        />
      )}

      <TextInput
        label="Nombre del cliente"
        required
        maxLength={200}
        value={nombre}
        onChange={(e: any) => setNombre(e.target.value)}
        error={errorFor('nombre', nombre)}
        helperText="Nombre o razón social; admite letras, números y signos como . , & - ( )."
        placeholder="Ej. Distribuidora Central, S.A."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="NIT"
          required
          restriction="nit"
          uppercase
          maxLength={20}
          value={nit}
          onChange={(e: any) => setNit(e.target.value)}
          error={errors.nit ?? (nit || nitCambio ? validationErrors.nit : undefined)}
          helperText={!isEditing
            ? 'Con dígito verificador válido (ej. 1234567-9) o CF; no puede repetirse entre clientes.'
            : nitCambio
              ? 'El NIT nuevo debe tener dígito verificador válido (ej. 1234567-9) o ser CF.'
              : 'NIT registrado del cliente; si lo cambias, el nuevo debe ser válido.'}
          placeholder="Ej. 1234567-9"
        />
        <Select
          label="Estado"
          required
          value={estado}
          onChange={(e: any) => setEstado(e.target.value)}
          options={ESTADOS_CLIENTE}
          helperText={isEditing ? 'Un cliente inactivo conserva su historial y saldos.' : 'Un cliente nuevo normalmente inicia Activo.'}
        />
      </div>

      {nitHeredadoInvalido && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          El NIT registrado no pasa el dígito verificador de la SAT. Puedes guardar sin cambiarlo, pero conviene corregirlo.
        </p>
      )}

      <Select
        label="Condición de pago"
        required
        value={idCondicion}
        onChange={(e: any) => setIdCondicion(e.target.value)}
        options={opcionesCondicion}
        error={errorFor('idCondicion', idCondicion)}
        helperText={isEditing ? 'Plazo de crédito del cliente; aplica a los documentos nuevos, no a los ya emitidos.' : 'Plazo de crédito con el que se le venderá al cliente.'}
      />

      {formError && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
      )}

      <FormActionButtons
        onCancel={onCancel}
        isSubmitting={isSubmitting}
        isEditing={isEditing}
        createLabel="Crear cliente"
        editLabel="Guardar cambios"
        isFormValid={!hasErrors(validationErrors) && huboCambios}
        blockers={huboCambios ? validationErrors : { sinCambios: 'No has modificado ningún dato.' }}
      />
    </form>
  );
};
