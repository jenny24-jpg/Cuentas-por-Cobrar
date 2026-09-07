import React, { useEffect, useState } from 'react';
import { TextInput, Select, TextArea, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { Ajuste, DocumentoCatalogoOption } from '@erp/contracts';

interface Props {
  ajuste?: Ajuste | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const AjusteForm = ({ ajuste, onSuccess, onCancel }: Props) => {
  const isEditing = !!ajuste;
  const [clientes, setClientes] = useState<DocumentoCatalogoOption[]>([]);
  const [empleados, setEmpleados] = useState<DocumentoCatalogoOption[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoCatalogoOption[]>([]);

  const [idCliente, setIdCliente] = useState(ajuste?.idCliente?.toString() ?? '');
  const [idDocumento, setIdDocumento] = useState(ajuste?.idDocumento?.toString() ?? '');
  const [tipoAjuste, setTipoAjuste] = useState(ajuste?.tipoAjuste ?? '');
  const [monto, setMonto] = useState(ajuste?.monto?.toString() ?? '');
  const [motivo, setMotivo] = useState(ajuste?.motivo ?? '');
  const [fecha, setFecha] = useState(ajuste?.fecha?.slice(0, 10) ?? '');
  const [idEmpleado, setIdEmpleado] = useState(ajuste?.idEmpleado?.toString() ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/clientes'),
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/empleados'),
    ])
      .then(([clientesData, empleadosData]) => {
        setClientes(clientesData);
        setEmpleados(empleadosData);
      })
      .catch(() => {
        setClientes([]);
        setEmpleados([]);
      });
  }, []);

  useEffect(() => {
    if (!idCliente) {
      setDocumentos([]);
      return;
    }

    apiClient
      .get<DocumentoCatalogoOption[]>(`/cxc/documentos/catalogos/clientes/${idCliente}/documentos`)
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
      idDocumento: idDocumento ? Number(idDocumento) : undefined,
      tipoAjuste,
      monto: Number(monto),
      motivo: motivo || undefined,
      fecha: fecha || undefined,
      idEmpleado: Number(idEmpleado),
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/ajustes/${ajuste!.idAjuste}`, payload);
      } else {
        await apiClient.post('/cxc/ajustes', payload);
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
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el ajuste');
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
        />
        <Select
          label="Documento"
          value={idDocumento}
          onChange={(e: any) => setIdDocumento(e.target.value)}
          options={documentos.map((d) => ({ value: d.id, label: d.label }))}
          placeholder={idCliente ? 'Seleccionar documento (opcional)' : 'Selecciona un cliente primero'}
          isReadOnly={!idCliente}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Tipo de ajuste"
          required
          value={tipoAjuste}
          onChange={(e: any) => setTipoAjuste(e.target.value)}
          error={errors.tipoAjuste}
        />
        <TextInput
          label="Monto"
          type="number"
          step="0.01"
          required
          value={monto}
          onChange={(e: any) => setMonto(e.target.value)}
          error={errors.monto}
        />
      </div>

      <TextArea
        label="Motivo"
        value={motivo}
        onChange={(e: any) => setMotivo(e.target.value)}
        rows={3}
        error={errors.motivo}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha"
          type="date"
          value={fecha}
          onChange={(e: any) => setFecha(e.target.value)}
        />
        <Select
          label="Empleado"
          required
          value={idEmpleado}
          onChange={(e: any) => setIdEmpleado(e.target.value)}
          options={empleados.map((e) => ({ value: e.id, label: e.label }))}
          error={errors.idEmpleado}
        />
      </div>

      {formError && <p className="text-sm text-red-600 font-medium">{formError}</p>}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear ajuste'}
        </Button>
      </div>
    </form>
  );
};
