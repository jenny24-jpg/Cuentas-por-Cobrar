import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { DataTable, StatusBadge } from '../../../shared/ui-kit';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { apiClient, ApiError } from '../../../shared/api';
import type { Ruta, RutaDetalle } from '@erp/contracts';
import { RutaOperacionPanel } from './components/RutaOperacionPanel';

export const RutaDetallePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const idRuta = Number(id);

  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [paradas, setParadas] = useState<RutaDetalle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paradaAEliminar, setParadaAEliminar] = useState<RutaDetalle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const cargar = () => {
    setIsLoading(true);
    setError(null);
    Promise.all([
      apiClient.get<Ruta>(`/cxc/rutas/${idRuta}`),
      apiClient.get<RutaDetalle[]>(`/cxc/rutas/${idRuta}/detalle`),
    ])
      .then(([rutaData, paradasData]) => {
        setRuta(rutaData);
        setParadas(paradasData);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la ruta');
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idRuta]);

  const handleDelete = async () => {
    if (!paradaAEliminar) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.delete(`/cxc/rutas/detalle/${paradaAEliminar.idRutaDetalle}`);
      setParadaAEliminar(null);
      cargar();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se pudo eliminar la parada');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/cxc/organizacion/rutas')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft size={16} /> Volver a Rutas
      </button>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-slate-900 text-sm font-bold">
            {ruta ? `Ruta: ${ruta.nombre}` : 'Ruta'}
          </h1>
          <p className="text-sm text-slate-500">
            {ruta ? `Responsable: ${ruta.nombreEmpleado ?? '—'} · Estado: ${ruta.estado}` : 'Paradas de la ruta.'}
          </p>
        </div>

      </div>

      {error && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {ruta && <RutaOperacionPanel idRuta={idRuta} estado={ruta.estado} />}
      {paradas.some((p) => !p.idDocumento) && <>
      <h2 className="text-sm font-bold">Paradas del formato anterior</h2>
      <p className="text-sm text-slate-500">
        Estas paradas no tienen documento, hora confirmada ni ubicación. Ya no se pueden crear ni editar: elimínalas y, si corresponde, asígnalas de nuevo con «Asignar documento».
      </p>
      <DataTable
        isLoading={isLoading}
        data={paradas.filter(p => !p.idDocumento)}
        emptyText="Esta ruta no tiene paradas del formato anterior"
        columns={[
          { header: 'Orden', accessorKey: 'ordenVisita', cell: ({ value }: any) => value ?? '—' },
          { header: 'Cliente', accessorKey: 'nombreCliente' },
          { header: 'Dirección', accessorKey: 'direccion', cell: ({ value }: any) => value ?? '—' },
          { header: 'Hora', accessorKey: 'horaVisita', cell: ({ value }: any) => value ?? '—' },
          {
            header: 'Monto pendiente',
            align: 'right',
            cell: ({ row }: any) => (row.montoPendiente ? `Q ${Number(row.montoPendiente).toFixed(2)}` : '—'),
          },
          {
            header: 'Estado visita',
            cell: ({ row }: any) => (row.estadoVisita ? <StatusBadge status={row.estadoVisita} /> : '—'),
          },
          {
            header: '',
            align: 'right',
            cell: ({ row }: any) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => setParadaAEliminar(row)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ),
          },
        ]}
      />
      </>}

      <ConfirmDialog
        isOpen={!!paradaAEliminar}
        onClose={() => { setParadaAEliminar(null); setDeleteError(null); }}
        onConfirm={handleDelete}
        title="Eliminar parada"
        description={`¿Eliminar la parada de "${paradaAEliminar?.nombreCliente}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isLoading={isDeleting}
      />
      {deleteError && (
        <p className="text-sm text-red-600 font-medium">{deleteError}</p>
      )}
    </div>
  );
};
