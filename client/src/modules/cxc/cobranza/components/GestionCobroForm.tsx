import React, { useEffect, useState } from 'react';
import { TextInput, Select, TextArea, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  validateRequiredSelect,
  validateNumber,
  validateDate,
  validateMaxLength,
  hasErrors,
  type ValidationErrors,
} from '../../../../shared/validation';
import type { CatalogoOption, GestionCobro } from '@erp/contracts';

interface GestionCobroFormProps {
  gestion?: GestionCobro | null;
  onSuccess: () => void;
  onCancel: () => void;
}

// NOTA: no se importa TIPOS_GESTION_COBRO desde @erp/contracts aquí a
// propósito. Vite/Rollup no logra resolver estáticamente constantes de
// runtime cuando llegan a través de 3+ niveles de `export *` encadenados
// compilados a CommonJS (limitación conocida del bundler, no del código).
// El backend SÍ importa la constante real desde contracts para validar.
// Si cambias los valores allá, cámbialos aquí también.
const TIPOS_GESTION_COBRO = ['LLAMADA', 'VISITA', 'EMAIL', 'WHATSAPP', 'CARTA', 'OTRO'] as const;
const TIPO_OPTIONS = TIPOS_GESTION_COBRO.map((t) => ({ value: t, label: t }));

export const GestionCobroForm = ({ gestion, onSuccess, onCancel }: GestionCobroFormProps) => {
  const isEditing = !!gestion;

  const [clientes, setClientes] = useState<CatalogoOption[]>([]);
  const [empleados, setEmpleados] = useState<CatalogoOption[]>([]);
  const [documentos, setDocumentos] = useState<CatalogoOption[]>([]);

  const [idCliente, setIdCliente] = useState(gestion?.idCliente?.toString() ?? '');
  const [idEmpleado, setIdEmpleado] = useState(gestion?.idEmpleado?.toString() ?? '');
  const [idDocumento, setIdDocumento] = useState(gestion?.idDocumento?.toString() ?? '');
  const [tipoGestion, setTipoGestion] = useState(gestion?.tipoGestion ?? '');
  const [resultado, setResultado] = useState(gestion?.resultado ?? '');
  const [observacion, setObservacion] = useState(gestion?.observacion ?? '');
  const [fechaCompromiso, setFechaCompromiso] = useState(gestion?.fechaCompromiso?.slice(0, 10) ?? '');
  const [montoCompromiso, setMontoCompromiso] = useState(gestion?.montoCompromiso?.toString() ?? '');

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<CatalogoOption[]>('/cxc/catalogos/clientes').then(setClientes).catch(() => setClientes([]));
    apiClient.get<CatalogoOption[]>('/cxc/catalogos/empleados').then(setEmpleados).catch(() => setEmpleados([]));
  }, []);

  useEffect(() => {
    if (!idCliente) {
      setDocumentos([]);
      return;
    }
    apiClient
      .get<CatalogoOption[]>(`/cxc/catalogos/clientes/${idCliente}/documentos-pendientes`)
      .then(setDocumentos)
      .catch(() => setDocumentos([]));
  }, [idCliente]);

  /**
   * Validación 100% del lado del cliente. Si devuelve cualquier error, el
   * submit se detiene ANTES de tocar la red — nunca se manda nada a medio
   * validar al backend.
   */
  const validate = (): ValidationErrors => {
    const next: ValidationErrors = {};

    const clienteErr = validateRequiredSelect(idCliente, 'un cliente');
    if (clienteErr) next.idCliente = clienteErr;

    const empleadoErr = validateRequiredSelect(idEmpleado, 'un empleado responsable');
    if (empleadoErr) next.idEmpleado = empleadoErr;

    const resultadoErr = validateMaxLength(resultado, 'Resultado', 80);
    if (resultadoErr) next.resultado = resultadoErr;

    const observacionErr = validateMaxLength(observacion, 'Observación', 500);
    if (observacionErr) next.observacion = observacionErr;

    // La fecha de compromiso, si se llena, no puede ser una fecha ya pasada
    // (no tiene sentido "comprometer" un pago para ayer).
    const fechaErr = validateDate(fechaCompromiso, 'La fecha de compromiso', { notPast: true });
    if (fechaErr) next.fechaCompromiso = fechaErr;

    const montoErr = validateNumber(montoCompromiso, 'El monto comprometido', { positive: true });
    if (montoErr) next.montoCompromiso = montoErr;

    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validationErrors = validate();
    if (hasErrors(validationErrors)) {
      setErrors(validationErrors);
      return; // Bloqueado: ni un solo request sale de aquí con datos inválidos.
    }
    setErrors({});
    setIsSubmitting(true);

    const payload = {
      idCliente: Number(idCliente),
      idEmpleado: Number(idEmpleado),
      idDocumento: idDocumento ? Number(idDocumento) : undefined,
      tipoGestion: tipoGestion || undefined,
      resultado: resultado || undefined,
      observacion: observacion || undefined,
      fechaCompromiso: fechaCompromiso || undefined,
      montoCompromiso: montoCompromiso ? Number(montoCompromiso) : undefined,
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/gestiones-cobro/${gestion!.idGestion}`, payload);
      } else {
        await apiClient.post('/cxc/gestiones-cobro', payload);
      }
      onSuccess();
    } catch (err) {
      // Segunda línea de defensa: si el backend rechaza algo que el cliente
      // no captó (ej. una regla de negocio que solo Oracle conoce), se
      // muestra igual, con el mismo mecanismo de errores por campo.
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: ValidationErrors = {};
        (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => {
          fieldErrors[d.campo] = d.mensaje;
        });
        setErrors(fieldErrors);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar la gestión');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Cliente"
          required
          value={idCliente}
          onChange={(e: any) => { setIdCliente(e.target.value); setIdDocumento(''); }}
          options={clientes.map((c) => ({ value: c.id, label: c.label }))}
          error={errors.idCliente}
          helperText="El cliente al que se le realizó la gestión de cobro."
        />
        <Select
          label="Empleado responsable"
          required
          value={idEmpleado}
          onChange={(e: any) => setIdEmpleado(e.target.value)}
          options={empleados.map((emp) => ({ value: emp.id, label: emp.label }))}
          error={errors.idEmpleado}
          helperText="La persona del equipo de cobranza que hizo el contacto."
        />
      </div>

      <Select
        label="Documento relacionado"
        value={idDocumento}
        onChange={(e: any) => setIdDocumento(e.target.value)}
        options={documentos.map((d) => ({ value: d.id, label: d.label }))}
        placeholder={idCliente ? 'Seleccionar documento (opcional)' : 'Selecciona un cliente primero'}
        isReadOnly={!idCliente}
        helperText="Opcional: solo aparecen documentos con saldo pendiente del cliente seleccionado."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Tipo de gestión"
          value={tipoGestion}
          onChange={(e: any) => setTipoGestion(e.target.value)}
          options={TIPO_OPTIONS}
          helperText="Cómo se realizó el contacto con el cliente."
        />
        <TextInput
          label="Resultado"
          value={resultado}
          onChange={(e: any) => setResultado(e.target.value)}
          placeholder="Ej. Cliente comprometió pago"
          error={errors.resultado}
          helperText="Resumen corto de cómo terminó la gestión (máx. 80 caracteres)."
        />
      </div>

      <TextArea
        label="Observación"
        value={observacion}
        onChange={(e: any) => setObservacion(e.target.value)}
        rows={3}
        error={errors.observacion}
        helperText="Detalle adicional de la conversación o visita (máx. 500 caracteres)."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha compromiso"
          type="date"
          value={fechaCompromiso}
          onChange={(e: any) => setFechaCompromiso(e.target.value)}
          error={errors.fechaCompromiso}
          helperText="Solo si el cliente se comprometió a pagar en una fecha específica. No puede ser una fecha pasada."
        />
        <TextInput
          label="Monto comprometido"
          type="number"
          step="0.01"
          value={montoCompromiso}
          onChange={(e: any) => setMontoCompromiso(e.target.value)}
          error={errors.montoCompromiso}
          helperText="Cantidad exacta que el cliente prometió pagar, si aplica."
        />
      </div>

      {formError && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear gestión'}
        </Button>
      </div>
    </form>
  );
};