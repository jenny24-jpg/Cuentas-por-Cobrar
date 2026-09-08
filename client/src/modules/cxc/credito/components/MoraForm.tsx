import React, { useEffect, useState } from 'react';
import {
  TextInput,
  Select,
  Button,
} from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type {
  CatalogoOption,
  Mora,
} from '@erp/contracts';

const ESTADOS_MORA = [
  'ACTIVA',
  'PAGADA',
  'ANULADA',
] as const;

const ESTADO_OPTIONS = ESTADOS_MORA.map((estado) => ({
  value: estado,
  label:
    estado === 'ACTIVA'
      ? 'Activa'
      : estado === 'PAGADA'
        ? 'Pagada'
        : 'Anulada',
}));

interface MoraFormProps {
  mora?: Mora | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const MoraForm = ({
  mora,
  onSuccess,
  onCancel,
}: MoraFormProps) => {
  const isEditing = !!mora;

  const [clientes, setClientes] = useState<CatalogoOption[]>([]);
  const [documentos, setDocumentos] = useState<CatalogoOption[]>([]);

  // Cliente es únicamente auxiliar para filtrar documentos.
  // No se guarda en CXC_MORA.
  const [idCliente, setIdCliente] = useState('');

  const [idDocumento, setIdDocumento] = useState(
    mora?.idDocumento?.toString() ?? '',
  );

  const [diasMora, setDiasMora] = useState(
    mora?.diasMora?.toString() ?? '',
  );

  const [saldoVencido, setSaldoVencido] = useState(
    mora?.saldoVencido?.toString() ?? '',
  );

  const [porcentajeMora, setPorcentajeMora] = useState(
    mora?.porcentajeMora?.toString() ?? '',
  );

  const [montoMora, setMontoMora] = useState(
    mora?.montoMora?.toString() ?? '',
  );

  const [fechaCalculo, setFechaCalculo] = useState(
    mora?.fechaCalculo?.slice(0, 10) ?? '',
  );

  const [estado, setEstado] = useState(
    mora?.estado ?? 'ACTIVA',
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<CatalogoOption[]>('/cxc/catalogos/clientes')
      .then(setClientes)
      .catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    if (!idCliente) {
      if (!isEditing) {
        setDocumentos([]);
        setIdDocumento('');
      }

      return;
    }

    apiClient
      .get<CatalogoOption[]>(
        `/cxc/catalogos/clientes/${idCliente}/documentos-pendientes`,
      )
      .then(setDocumentos)
      .catch(() => setDocumentos([]));
  }, [idCliente, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      idDocumento: Number(idDocumento),

      diasMora:
        diasMora !== ''
          ? Number(diasMora)
          : null,

      saldoVencido:
        saldoVencido !== ''
          ? Number(saldoVencido)
          : null,

      porcentajeMora:
        porcentajeMora !== ''
          ? Number(porcentajeMora)
          : null,

      montoMora:
        montoMora !== ''
          ? Number(montoMora)
          : null,

      fechaCalculo:
        fechaCalculo || null,

      estado,
    };

    try {
      if (isEditing) {
        await apiClient.patch(
          `/cxc/mora/${mora!.idMora}`,
          payload,
        );
      } else {
        await apiClient.post(
          '/cxc/mora',
          payload,
        );
      }

      onSuccess();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 400 &&
        Array.isArray(err.details)
      ) {
        const fieldErrors: Record<string, string> = {};

        (
          err.details as Array<{
            campo: string;
            mensaje: string;
          }>
        ).forEach((detail) => {
          fieldErrors[detail.campo] = detail.mensaje;
        });

        setErrors(fieldErrors);
      } else {
        setFormError(
          err instanceof ApiError
            ? err.message
            : 'No se pudo guardar el registro de mora',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      {!isEditing && (
        <Select
          label="Cliente"
          required
          value={idCliente}
          onChange={(e: any) => {
            setIdCliente(e.target.value);
            setIdDocumento('');
          }}
          options={clientes.map((cliente) => ({
            value: cliente.id,
            label: cliente.label,
          }))}
          placeholder="Seleccionar cliente"
        />
      )}

      {isEditing ? (
        <TextInput
          label="ID Documento"
          type="number"
          required
          value={idDocumento}
          onChange={(e: any) =>
            setIdDocumento(e.target.value)
          }
          error={errors.idDocumento}
        />
      ) : (
        <Select
          label="Documento"
          required
          value={idDocumento}
          onChange={(e: any) =>
            setIdDocumento(e.target.value)
          }
          options={documentos.map((documento) => ({
            value: documento.id,
            label: documento.label,
          }))}
          placeholder={
            idCliente
              ? 'Seleccionar documento'
              : 'Selecciona un cliente primero'
          }
          isReadOnly={!idCliente}
          error={errors.idDocumento}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Días de mora"
          type="number"
          min="0"
          value={diasMora}
          onChange={(e: any) =>
            setDiasMora(e.target.value)
          }
          error={errors.diasMora}
          placeholder="0"
        />

        <TextInput
          label="Saldo vencido"
          type="number"
          step="0.01"
          min="0"
          value={saldoVencido}
          onChange={(e: any) =>
            setSaldoVencido(e.target.value)
          }
          error={errors.saldoVencido}
          placeholder="0.00"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Porcentaje de mora"
          type="number"
          step="0.0001"
          min="0"
          value={porcentajeMora}
          onChange={(e: any) =>
            setPorcentajeMora(e.target.value)
          }
          error={errors.porcentajeMora}
          placeholder="0.0000"
        />

        <TextInput
          label="Monto de mora"
          type="number"
          step="0.01"
          min="0"
          value={montoMora}
          onChange={(e: any) =>
            setMontoMora(e.target.value)
          }
          error={errors.montoMora}
          placeholder="0.00"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha de cálculo"
          type="date"
          value={fechaCalculo}
          onChange={(e: any) =>
            setFechaCalculo(e.target.value)
          }
          error={errors.fechaCalculo}
        />

        <Select
          label="Estado"
          required
          value={estado}
          onChange={(e: any) =>
            setEstado(e.target.value)
          }
          options={ESTADO_OPTIONS}
          error={errors.estado}
        />
      </div>

      {formError && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>

        <Button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? 'Guardando...'
            : isEditing
              ? 'Guardar cambios'
              : 'Crear mora'}
        </Button>
      </div>
    </form>
  );
};