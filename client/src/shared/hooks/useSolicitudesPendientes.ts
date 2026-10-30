import { useCallback, useEffect, useState } from 'react';
import type { TipoSolicitudReversa } from '@erp/contracts';
import { apiClient } from '../api';

/**
 * Registros de un tipo con una solicitud de reversa o anulación pendiente de aprobar,
 * para marcar la fila y no dejar pedir lo mismo dos veces.
 */
export function useSolicitudesPendientes(tipo: TipoSolicitudReversa) {
  const [pendientes, setPendientes] = useState<Set<number>>(new Set());
  const recargar = useCallback(() => {
    apiClient.get<number[]>(`/cxc/solicitudes-reversa/pendientes?tipo=${tipo}`)
      .then((ids) => setPendientes(new Set(ids)))
      .catch(() => setPendientes(new Set()));
  }, [tipo]);
  useEffect(() => { recargar(); }, [recargar]);
  return { pendientes, recargar };
}
