
import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  useParams,
  useNavigate,
} from 'react-router-dom';

import {
  ArrowLeft,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Ban,
} from 'lucide-react';

import {
  DataTable,
  StatusBadge,
} from '../../../shared/ui-kit';

import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';

import {
  apiClient,
  ApiError,
} from '../../../shared/api';

import type {
  Ruta,
  RutaDetalle,
} from '@erp/contracts';

import { RutaOperacionPanel } from './components/RutaOperacionPanel';

// =====================================================
// DETALLE DE RUTA
// =====================================================

export const RutaDetallePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const idRuta = Number(id);

  // =====================================================
  // ESTADO GENERAL
  // =====================================================

  const [ruta, setRuta] =
    useState<Ruta | null>(null);

  const [paradas, setParadas] =
    useState<RutaDetalle[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  // =====================================================
  // ELIMINACIÓN DE PARADAS ANTIGUAS
  // =====================================================

  const [
    paradaAEliminar,
    setParadaAEliminar,
  ] = useState<RutaDetalle | null>(null);

  const [isDeleting, setIsDeleting] =
    useState(false);

  const [deleteError, setDeleteError] =
    useState<string | null>(null);

  // =====================================================
  // FINALIZACIÓN DE RUTA
  // =====================================================

  const [
    confirmarFinalizacion,
    setConfirmarFinalizacion,
  ] = useState(false);

  const [
    isFinalizing,
    setIsFinalizing,
  ] = useState(false);

  const [
    finalizationError,
    setFinalizationError,
  ] = useState<string | null>(null);

  const [confirmarCancelacion, setConfirmarCancelacion] = useState(false);
  const [isCancelando, setIsCancelando] = useState(false);
  const [cancelacionError, setCancelacionError] = useState<string | null>(null);

  const [
    successMessage,
    setSuccessMessage,
  ] = useState<string | null>(null);

  // =====================================================
  // ESTADOS DERIVADOS
  // =====================================================

  const estadoRuta = String(
    ruta?.estado ?? '',
  ).trim().toUpperCase();

  const rutaEnProceso =
    estadoRuta === 'EN_PROCESO';

  const rutaCompletada =
    estadoRuta === 'COMPLETADA';

  const rutaCancelada =
    estadoRuta === 'CANCELADA';

  const rutaCerrada =
    rutaCompletada || rutaCancelada;

  const puedeFinalizar =
    rutaEnProceso &&
    !isLoading &&
    !isFinalizing;

  const puedeCancelar =
    ['PLANIFICADA', 'EN_PROCESO'].includes(estadoRuta) &&
    !isLoading &&
    !isCancelando;

  const paradasAntiguas = paradas.filter(
    (parada) => !parada.idDocumento,
  );

  // =====================================================
  // CONSULTAR RUTA Y PARADAS
  // =====================================================

  const cargar = useCallback(async () => {
    if (
      !Number.isInteger(idRuta) ||
      idRuta <= 0
    ) {
      setError('El identificador de ruta no es válido.');
      setRuta(null);
      setParadas([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [rutaData, paradasData] =
        await Promise.all([
          apiClient.get<Ruta>(
            `/cxc/rutas/${idRuta}`,
          ),

          apiClient.get<RutaDetalle[]>(
            `/cxc/rutas/${idRuta}/detalle`,
          ),
        ]);

      setRuta(rutaData);
      setParadas(paradasData);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo cargar la ruta',
      );
    } finally {
      setIsLoading(false);
    }
  }, [idRuta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // =====================================================
  // ELIMINAR PARADA DEL FORMATO ANTERIOR
  // =====================================================

  const handleDelete = async () => {
    if (
      !paradaAEliminar ||
      isDeleting ||
      rutaCerrada
    ) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await apiClient.delete(
        `/cxc/rutas/detalle/${paradaAEliminar.idRutaDetalle}`,
      );

      setParadaAEliminar(null);

      await cargar();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo eliminar la parada',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // =====================================================
  // FINALIZAR RUTA FORMALMENTE
  // =====================================================

  const handleFinalizarRuta = async () => {
    if (
      !puedeFinalizar ||
      !ruta ||
      !Number.isInteger(idRuta) ||
      idRuta <= 0
    ) {
      return;
    }

    setIsFinalizing(true);
    setFinalizationError(null);
    setSuccessMessage(null);

    try {
      // El servidor comprueba:
      //
      // - Ruta EN_PROCESO.
      // - Al menos una parada asignada.
      // - Ausencia de paradas pendientes.
      // - Resultados definitivos válidos.
      // - Bloqueo transaccional FOR UPDATE.
      //
      // El frontend no decide si una
      // parada está finalizada.
      // La decisión pertenece al backend.

      await apiClient.post(
        `/cxc/rutas/${idRuta}/finalizar`,
        {},
      );

      setConfirmarFinalizacion(false);

      setSuccessMessage(
        'La ruta se finalizó correctamente. Su estado ahora es COMPLETADA.',
      );

      // Consultar nuevamente el estado real
      // para actualizar la interfaz.

      await cargar();
    } catch (err) {
      // El backend devuelve { error: string, code: 'CONFLICT' } al responder 409.
      // ApiError puede mapear ese texto a message; se contempla también error.
      const apiError = err as {
        message?: unknown;
        error?: unknown;
        details?: Array<{ mensaje?: string }>;
      } | null;
      const detalles = Array.isArray(apiError?.details)
        ? apiError.details.map((item) => item.mensaje).filter(Boolean).join('\n')
        : '';
      const textoServidor =
        typeof apiError?.error === 'string' ? apiError.error :
        typeof apiError?.message === 'string' ? apiError.message : '';
      setFinalizationError(
        detalles || textoServidor || 'No se pudo finalizar la ruta.',
      );
      // El diálogo permanece abierto, mostrando el motivo dentro de él.
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleCancelarRuta = async () => {
    if (!puedeCancelar || !ruta || !Number.isInteger(idRuta) || idRuta <= 0) return;
    setIsCancelando(true);
    setCancelacionError(null);
    setSuccessMessage(null);
    try {
      await apiClient.post(`/cxc/rutas/${idRuta}/cancelar`, {});
      setConfirmarCancelacion(false);
      setSuccessMessage('La ruta se cancelo. Se conservaron las paradas y los cobros ya aplicados.');
      await cargar();
    } catch (err) {
      const apiError = err as { message?: unknown; error?: unknown; details?: Array<{ mensaje?: string }> } | null;
      const detalles = Array.isArray(apiError?.details)
        ? apiError.details.map((item) => item.mensaje).filter(Boolean).join('\n')
        : '';
      const textoServidor = typeof apiError?.error === 'string' ? apiError.error
        : typeof apiError?.message === 'string' ? apiError.message : '';
      setCancelacionError(detalles || textoServidor || 'No se pudo cancelar la ruta.');
    } finally {
      setIsCancelando(false);
    }
  };

  // =====================================================
  // INTERFAZ PRINCIPAL
  // =====================================================

  return (
    <div className="space-y-6">

      {/* REGRESAR A RUTAS */}

      <button
        type="button"
        onClick={() =>
          navigate('/cxc/organizacion/rutas')
        }
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft size={16} />
        Volver a Rutas
      </button>

      {/* ENCABEZADO */}

      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-slate-900 text-sm font-bold">
            {ruta
              ? `Ruta: ${ruta.nombre}`
              : 'Ruta'}
          </h1>

          <p className="text-sm text-slate-500">
            {ruta
              ? `Responsable: ${
                  ruta.nombreEmpleado ?? '—'
                } · Estado: ${ruta.estado}`
              : 'Paradas de la ruta.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">

          {/* ACTUALIZAR ESTADO */}

          <button
            type="button"
            onClick={() => {
              setSuccessMessage(null);
              setFinalizationError(null);
              void cargar();
            }}
            disabled={isLoading || isFinalizing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Actualizar información de la ruta"
          >
            <RefreshCw
              size={16}
              className={
                isLoading
                  ? 'animate-spin'
                  : ''
              }
            />
            Actualizar
          </button>

          {/* FINALIZAR RUTA */}

          {rutaEnProceso && (
            <button
              type="button"
              onClick={() => {
                setFinalizationError(null);
                setSuccessMessage(null);
                setConfirmarFinalizacion(true);
              }}
              disabled={!puedeFinalizar}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 size={17} />
              Finalizar ruta
            </button>
          )}

          {['PLANIFICADA', 'EN_PROCESO'].includes(estadoRuta) && (
            <button
              type="button"
              onClick={() => { setCancelacionError(null); setConfirmarCancelacion(true); }}
              disabled={!puedeCancelar}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              <Ban size={17} />
              Cancelar ruta
            </button>
          )}

        </div>
      </div>

      {/* ESTADO DE RUTA COMPLETADA */}

      {rutaCompletada && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2
            size={20}
            className="mt-0.5 shrink-0 text-emerald-700"
          />

          <div>
            <p className="text-sm font-semibold text-emerald-800">
              Ruta completada
            </p>

            <p className="text-sm text-emerald-700">
              Esta ruta fue finalizada formalmente.
              Puedes consultar sus documentos,
              visitas y cobros registrados.
            </p>
          </div>
        </div>
      )}

      {rutaCancelada && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Ruta cancelada. Las paradas y los cobros aplicados se conservan para consulta; no se pueden registrar nuevas actividades.
        </div>
      )}

      {/* CONFIRMACIÓN DE ÉXITO */}

      {successMessage && (
        <p
          role="status"
          className="text-sm font-medium rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800"
        >
          {successMessage}
        </p>
      )}

      {/* ERROR DE CARGA */}

      {error && (
        <p
          role="alert"
          className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3"
        >
          {error}
        </p>
      )}

      {/* PANEL DE OPERACIONES */}

      {ruta && (
        <RutaOperacionPanel
  key={idRuta}
  idRuta={idRuta}
  estado={ruta.estado}
  onActualizacion={cargar}
/>
      )}

      {/* =================================================
          PARADAS DEL FORMATO ANTERIOR
          ================================================= */}

      {paradasAntiguas.length > 0 && (
        <>
          <h2 className="text-sm font-bold">
            Paradas del formato anterior
          </h2>

          <p className="text-sm text-slate-500">
            Estas paradas no tienen documento,
            hora confirmada ni ubicación.
            Ya no se pueden crear ni editar:
            elimínalas y, si corresponde,
            asígnalas de nuevo con
            «Asignar documento».
          </p>

          <DataTable
            isLoading={isLoading}
            data={paradasAntiguas}
            emptyText="Esta ruta no tiene paradas del formato anterior"
            columns={[
              {
                header: 'Orden',
                accessorKey: 'ordenVisita',
                cell: ({ value }: any) =>
                  value ?? '—',
              },

              {
                header: 'Cliente',
                accessorKey: 'nombreCliente',
              },

              {
                header: 'Dirección',
                accessorKey: 'direccion',
                cell: ({ value }: any) =>
                  value ?? '—',
              },

              {
                header: 'Hora',
                accessorKey: 'horaVisita',
                cell: ({ value }: any) =>
                  value ?? '—',
              },

              {
                header: 'Monto pendiente',
                align: 'right',
                cell: ({ row }: any) =>
                  row.montoPendiente
                    ? `Q ${Number(
                        row.montoPendiente,
                      ).toFixed(2)}`
                    : '—',
              },

              {
                header: 'Estado visita',
                cell: ({ row }: any) =>
                  row.estadoVisita ? (
                    <StatusBadge
                      status={row.estadoVisita}
                    />
                  ) : (
                    '—'
                  ),
              },

              {
                header: '',
                align: 'right',
                cell: ({ row }: any) => (
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setParadaAEliminar(row)
                      }
                      disabled={rutaCerrada}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={
                        rutaCerrada
                          ? 'No se pueden eliminar paradas de una ruta cerrada'
                          : 'Eliminar'
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {/* =================================================
          CONFIRMAR ELIMINACIÓN
          ================================================= */}

      <ConfirmDialog
        isOpen={!!paradaAEliminar}
        onClose={() => {
          if (isDeleting) return;

          setParadaAEliminar(null);
          setDeleteError(null);
        }}
        onConfirm={handleDelete}
        title="Eliminar parada"
        description={`¿Eliminar la parada de "${
          paradaAEliminar?.nombreCliente ?? ''
        }"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isLoading={isDeleting}
      />

      {deleteError && (
        <p
          role="alert"
          className="text-sm text-red-600 font-medium"
        >
          {deleteError}
        </p>
      )}

      {/* =================================================
          CONFIRMAR FINALIZACIÓN DE RUTA
          ================================================= */}

      <ConfirmDialog
        isOpen={confirmarFinalizacion}
        onClose={() => {
          if (isFinalizing) return;

          setConfirmarFinalizacion(false);
          setFinalizationError(null);
        }}
        onConfirm={handleFinalizarRuta}
        title="Finalizar ruta de cobranza"
        description={
          `¿Confirmas la finalización de la ruta "${
            ruta?.nombre ?? ''
          }"? ` +
          'El sistema comprobará que todas las paradas tengan un resultado definitivo. ' +
          'Después del cierre no podrás asignar documentos, aplicar nuevos cobros ni registrar actividades en esta ruta.'
        }
        confirmLabel="Finalizar ruta"
        isLoading={isFinalizing}
        errorMessage={finalizationError}
      />

      <ConfirmDialog
        isOpen={confirmarCancelacion}
        onClose={() => {
          if (isCancelando) return;
          setConfirmarCancelacion(false);
          setCancelacionError(null);
        }}
        onConfirm={handleCancelarRuta}
        title="Cancelar ruta de cobranza"
        description={`¿Cancelar la ruta "${ruta?.nombre ?? ''}"? Las paradas quedaran cerradas y los cobros ya aplicados se conservaran; no se podran registrar nuevas actividades.`}
        confirmLabel="Cancelar ruta"
        isLoading={isCancelando}
        errorMessage={cancelacionError}
      />
    </div>
  );
};
