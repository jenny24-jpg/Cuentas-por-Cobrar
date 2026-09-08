import React, { useEffect, useState } from 'react';
import {
  TextInput,
  Select,
  Button,
} from '../../../../shared/ui-kit';
import { apiClient, ApiError } from '../../../../shared/api';
import type {
  AplicacionNotaCredito,
  CatalogoOption,
} from '@erp/contracts';

interface AplicacionNotaCreditoFormProps {
  aplicacion?: AplicacionNotaCredito | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const AplicacionNotaCreditoForm = ({
  aplicacion,
  onSuccess,
  onCancel,
}: AplicacionNotaCreditoFormProps) => {
  const isEditing = !!aplicacion;

  const [notasCredito, setNotasCredito] = useState<CatalogoOption[]>([]);
  const [documentos, setDocumentos] = useState<CatalogoOption[]>([]);

  const [idNotaCredito, setIdNotaCredito] = useState(
    aplicacion?.idNotaCredito?.toString() ?? '',
  );

  const [idDocumento, setIdDocumento] = useState(
    aplicacion?.idDocumento?.toString() ?? '',
  );

  const [montoAplicado, setMontoAplicado] = useState(
    aplicacion?.montoAplicado?.toString() ?? '',
  );

  const [fechaAplicacion, setFechaAplicacion] = useState(
    aplicacion?.fechaAplicacion?.slice(0, 10) ?? '',
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<CatalogoOption[]>('/cxc/catalogos/notas-credito')
      .then(setNotasCredito)
      .catch(() => setNotasCredito([]));
  }, []);

  useEffect(() => {
    if (!idNotaCredito) {
      setDocumentos([]);
      return;
    }

    const cargarDocumentos = async () => {
      try {
        const nota = await apiClient.get<{
          idNotaCredito: number;
          idCliente: number;
        }>(`/cxc/notas-credito/${idNotaCredito}`);

        const docs = await apiClient.get<CatalogoOption[]>(
          `/cxc/catalogos/clientes/${nota.idCliente}/documentos-pendientes`,
        );

        setDocumentos(docs);
      } catch {
        setDocumentos([]);
      }
    };

    cargarDocumentos();
  }, [idNotaCredito]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      idNotaCredito: Number(idNotaCredito),
      idDocumento: Number(idDocumento),
      montoAplicado: Number(montoAplicado),
      fechaAplicacion,
    };

    try {
      if (isEditing) {
        await apiClient.patch(
          `/cxc/aplicaciones-nota-credito/${aplicacion!.idAplicacionNc}`,
          payload,
        );
      } else {
        await apiClient.post(
          '/cxc/aplicaciones-nota-credito',
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
            : 'No se pudo guardar la aplicación de nota de crédito',
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
        label="Nota de Crédito"
        required
        value={idNotaCredito}
        onChange={(e: any) => {
          setIdNotaCredito(e.target.value);
          setIdDocumento('');
        }}
        options={notasCredito.map((nota) => ({
          value: nota.id,
          label: nota.label,
        }))}
        placeholder="Seleccionar nota de crédito"
        error={errors.idNotaCredito}
      />

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
          idNotaCredito
            ? 'Seleccionar documento'
            : 'Selecciona una nota de crédito primero'
        }
        isReadOnly={!idNotaCredito}
        error={errors.idDocumento}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Monto aplicado"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={montoAplicado}
          onChange={(e: any) =>
            setMontoAplicado(e.target.value)
          }
          error={errors.montoAplicado}
          placeholder="0.00"
        />

        <TextInput
          label="Fecha de aplicación"
          type="date"
          required
          value={fechaAplicacion}
          onChange={(e: any) =>
            setFechaAplicacion(e.target.value)
          }
          error={errors.fechaAplicacion}
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
              : 'Crear aplicación'}
        </Button>
      </div>
    </form>
  );
};