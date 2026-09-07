import React, { useEffect, useState } from 'react';
import { TextInput, Select, Button } from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type { Documento, DocumentoCatalogoOption } from '@erp/contracts';

interface Props {
  documento?: Documento | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const DocumentoForm = ({ documento, onSuccess, onCancel }: Props) => {
  const isEditing = !!documento;

  const [clientes, setClientes] = useState<DocumentoCatalogoOption[]>([]);
  const [tipos, setTipos] = useState<DocumentoCatalogoOption[]>([]);
  const [monedas, setMonedas] = useState<DocumentoCatalogoOption[]>([]);

  const [idCliente, setIdCliente] = useState(documento?.idCliente?.toString() ?? '');
  const [nitCliente, setNitCliente] = useState(documento?.nitCliente ?? '');
  const [idTipoDocumento, setIdTipoDocumento] = useState(documento?.idTipoDocumento?.toString() ?? '');
  const [idMoneda, setIdMoneda] = useState(documento?.idMoneda?.toString() ?? '');
  const [estado, setEstado] = useState(documento?.estado ?? 'PENDIENTE');
  const [serie, setSerie] = useState(documento?.serie ?? '');
  const [numeroDocumento, setNumeroDocumento] = useState(documento?.numeroDocumento ?? '');
  const [fechaDocumento, setFechaDocumento] = useState(documento?.fechaDocumento?.slice(0, 10) ?? '');
  const [fechaVencimiento, setFechaVencimiento] = useState(documento?.fechaVencimiento?.slice(0, 10) ?? '');
  const [total, setTotal] = useState(documento?.total?.toString() ?? '');
  const [saldo, setSaldo] = useState(documento?.saldo?.toString() ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/clientes'),
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/tipos-documento'),
      apiClient.get<DocumentoCatalogoOption[]>('/cxc/documentos/catalogos/monedas'),
    ])
      .then(([clientesData, tiposData, monedasData]) => {
        setClientes(clientesData);
        setTipos(tiposData);
        setMonedas(monedasData);
      })
      .catch(() => {
        setClientes([]);
        setTipos([]);
        setMonedas([]);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      idCliente: Number(idCliente),
      nitCliente: nitCliente || undefined,
      idTipoDocumento: Number(idTipoDocumento),
      idMoneda: Number(idMoneda),
      estado,
      serie: serie || undefined,
      numeroDocumento,
      fechaDocumento,
      fechaVencimiento,
      total: Number(total),
      saldo: saldo ? Number(saldo) : undefined,
    };

    try {
      if (isEditing) {
        await apiClient.patch(`/cxc/documentos/${documento!.idDocumento}`, payload);
      } else {
        await apiClient.post('/cxc/documentos', payload);
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
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el documento');
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
          onChange={(e: any) => setIdCliente(e.target.value)}
          options={clientes.map((c) => ({ value: c.id, label: c.label }))}
          error={errors.idCliente}
        />
        <TextInput
          label="NIT del cliente"
          value={nitCliente}
          onChange={(e: any) => setNitCliente(e.target.value)}
          error={errors.nitCliente}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Select
          label="Tipo de documento"
          required
          value={idTipoDocumento}
          onChange={(e: any) => setIdTipoDocumento(e.target.value)}
          options={tipos.map((t) => ({ value: t.id, label: t.label }))}
          error={errors.idTipoDocumento}
        />
        <Select
          label="Moneda"
          required
          value={idMoneda}
          onChange={(e: any) => setIdMoneda(e.target.value)}
          options={monedas.map((m) => ({ value: m.id, label: m.label }))}
          error={errors.idMoneda}
        />
        <TextInput
          label="Estado"
          required
          value={estado}
          onChange={(e: any) => setEstado(e.target.value)}
          error={errors.estado}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Serie"
          value={serie}
          onChange={(e: any) => setSerie(e.target.value)}
        />
        <TextInput
          label="Número de documento"
          required
          value={numeroDocumento}
          onChange={(e: any) => setNumeroDocumento(e.target.value)}
          error={errors.numeroDocumento}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha del documento"
          type="date"
          required
          value={fechaDocumento}
          onChange={(e: any) => setFechaDocumento(e.target.value)}
          error={errors.fechaDocumento}
        />
        <TextInput
          label="Fecha de vencimiento"
          type="date"
          required
          value={fechaVencimiento}
          onChange={(e: any) => setFechaVencimiento(e.target.value)}
          error={errors.fechaVencimiento}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Total"
          type="number"
          step="0.01"
          required
          value={total}
          onChange={(e: any) => setTotal(e.target.value)}
          error={errors.total}
        />
        <TextInput
          label="Saldo"
          type="number"
          step="0.01"
          value={saldo}
          onChange={(e: any) => setSaldo(e.target.value)}
          helperText="Si se deja vacío al crear, inicia igual al total."
          error={errors.saldo}
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
          {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear documento'}
        </Button>
      </div>
    </form>
  );
};
