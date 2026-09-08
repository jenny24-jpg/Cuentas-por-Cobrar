import React, { useEffect, useState } from 'react';
import { TextInput, Select, TextArea, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { CatalogoOption, GestionCobro } from '@erp/contracts';

// NOTA: no se importa TIPOS_GESTION_COBRO desde @erp/contracts aquí a
// propósito. Vite/Rollup no logra resolver estáticamente constantes de
// runtime cuando llegan a través de 3+ niveles de `export *` encadenados
// compilados a CommonJS (limitación conocida del bundler, no del código).
// El backend SÍ importa la constante real desde contracts para validar
// (ver packages/contracts/src/modules/cxc/cobranza/gestion-cobro.ts).
// Si cambias los valores allá, cámbialos aquí también.
const TIPOS_GESTION_COBRO = ['LLAMADA', 'VISITA', 'EMAIL', 'WHATSAPP', 'CARTA', 'OTRO'] as const;

interface GestionCobroFormProps {
  gestion?: GestionCobro | null;
  onSuccess: () => void;
  onCancel: () => void;
}

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

  const [errors, setErrors] = useState<Record<string, string>>({});
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
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
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
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
          onChange={(e) => { setIdCliente(e.target.value); setIdDocumento(''); }}
          options={clientes.map((c) => ({ value: c.id, label: c.label }))}
          error={errors.idCliente}
        />
        <Select
          label="Empleado responsable"
          required
          value={idEmpleado}
          onChange={(e) => setIdEmpleado(e.target.value)}
          options={empleados.map((e) => ({ value: e.id, label: e.label }))}
          error={errors.idEmpleado}
        />
      </div>

      <Select
        label="Documento relacionado"
        value={idDocumento}
        onChange={(e) => setIdDocumento(e.target.value)}
        options={documentos.map((d) => ({ value: d.id, label: d.label }))}
        placeholder={idCliente ? 'Seleccionar documento (opcional)' : 'Selecciona un cliente primero'}
        isReadOnly={!idCliente}
        helperText="Opcional: solo documentos con saldo pendiente del cliente seleccionado"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Tipo de gestión"
          value={tipoGestion}
          onChange={(e) => setTipoGestion(e.target.value)}
          options={TIPO_OPTIONS}
        />
        <TextInput
          label="Resultado"
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          placeholder="Ej. Cliente comprometió pago"
        />
      </div>

      <TextArea
        label="Observación"
        value={observacion}
        onChange={(e) => setObservacion(e.target.value)}
        rows={3}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha compromiso"
          type="date"
          value={fechaCompromiso}
          onChange={(e) => setFechaCompromiso(e.target.value)}
        />
        <TextInput
          label="Monto comprometido"
          type="number"
          step="0.01"
          value={montoCompromiso}
          onChange={(e) => setMontoCompromiso(e.target.value)}
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
