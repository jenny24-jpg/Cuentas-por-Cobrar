import React, { useEffect, useState } from 'react';
import {
  TextInput,
  Select,
  TextArea,
  Button,
} from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type {
  CatalogoOption,
  NotaCredito,
} from '@erp/contracts';

const ESTADOS_NOTA_CREDITO = ['ACTIVA', 'ANULADA'] as const;

interface NotaCreditoFormProps {
  nota?: NotaCredito | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const ESTADO_OPTIONS = ESTADOS_NOTA_CREDITO.map((estado) => ({
  value: estado,
  label: estado === 'ACTIVA' ? 'Activa' : 'Anulada',
}));

export const NotaCreditoForm = ({
  nota,
  onSuccess,
  onCancel,
}: NotaCreditoFormProps) => {
  const isEditing = !!nota;

  const [clientes, setClientes] = useState<CatalogoOption[]>([]);
  const [documentos, setDocumentos] = useState<CatalogoOption[]>([]);

  const [idCliente, setIdCliente] = useState(
    nota?.idCliente?.toString() ?? '',
  );

  const [idDocumentoReferencia, setIdDocumentoReferencia] = useState(
    nota?.idDocumentoReferencia?.toString() ?? '',
  );

  const [descripcion, setDescripcion] = useState(
    nota?.descripcion ?? '',
  );

  const [serie, setSerie] = useState(
    nota?.serie ?? '',
  );

  const [numero, setNumero] = useState(
    nota?.numero ?? '',
  );

  const [fecha, setFecha] = useState(
    nota?.fecha?.slice(0, 10) ?? '',
  );

  const [monto, setMonto] = useState(
    nota?.monto?.toString() ?? '',
  );

  const [estado, setEstado] = useState(
    nota?.estado ?? 'ACTIVA',
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
      setDocumentos([]);
      return;
    }

    apiClient
      .get<CatalogoOption[]>(
        `/cxc/catalogos/clientes/${idCliente}/documentos-pendientes`,
      )
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

      idDocumentoReferencia: idDocumentoReferencia
        ? Number(idDocumentoReferencia)
        : null,

      descripcion: descripcion || null,
      serie: serie || null,
      numero: numero || null,
      fecha,
      monto: Number(monto),
      estado: estado as 'ACTIVA' | 'ANULADA',
    };

    try {
      if (isEditing) {
        await apiClient.patch(
          `/cxc/notas-credito/${nota!.idNotaCredito}`,
          payload,
        );
      } else {
        await apiClient.post(
          '/cxc/notas-credito',
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
            : 'No se pudo guardar la nota de crédito',
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
      <Select
        label="Cliente"
        required
        value={idCliente}
        onChange={(e: any) => {
          setIdCliente(e.target.value);
          setIdDocumentoReferencia('');
        }}
        options={clientes.map((cliente) => ({
          value: cliente.id,
          label: cliente.label,
        }))}
        error={errors.idCliente}
        placeholder="Seleccionar cliente"
      />

      <Select
        label="Documento de referencia"
        value={idDocumentoReferencia}
        onChange={(e: any) =>
          setIdDocumentoReferencia(e.target.value)
        }
        options={documentos.map((documento) => ({
          value: documento.id,
          label: documento.label,
        }))}
        placeholder={
          idCliente
            ? 'Seleccionar documento (opcional)'
            : 'Selecciona un cliente primero'
        }
        isReadOnly={!idCliente}
        error={errors.idDocumentoReferencia}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Serie"
          value={serie}
          onChange={(e: any) =>
            setSerie(e.target.value)
          }
          error={errors.serie}
          placeholder="Ej. NC"
        />

        <TextInput
          label="Número"
          value={numero}
          onChange={(e: any) =>
            setNumero(e.target.value)
          }
          error={errors.numero}
          placeholder="Ej. 000001"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Fecha"
          type="date"
          required
          value={fecha}
          onChange={(e: any) =>
            setFecha(e.target.value)
          }
          error={errors.fecha}
        />

        <TextInput
          label="Monto"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={monto}
          onChange={(e: any) =>
            setMonto(e.target.value)
          }
          error={errors.monto}
          placeholder="0.00"
        />
      </div>

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

      <TextArea
        label="Descripción"
        value={descripcion}
        onChange={(e: any) =>
          setDescripcion(e.target.value)
        }
        rows={3}
        error={errors.descripcion}
        placeholder="Descripción de la nota de crédito"
      />

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
              : 'Crear nota de crédito'}
        </Button>
      </div>
    </form>
  );
};