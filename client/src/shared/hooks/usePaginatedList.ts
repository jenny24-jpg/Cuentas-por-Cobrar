import { useState, useEffect, useCallback } from 'react';
import { apiClient, buildQueryString, ApiError } from '../api';
import type { PaginatedResponse, PaginationMeta } from '@erp/contracts';

const DEFAULT_META: PaginationMeta = { page: 1, limit: 10, total: 0, totalPages: 1 };

/**
 * Hook genérico para listados paginados con búsqueda. Encapsula el fetch,
 * el estado de carga/error, y expone refetch() para refrescar después de
 * crear/editar/eliminar un registro. Úsalo en vez de repetir useEffect +
 * fetch en cada página de listado.
 *
 * Uso:
 * const { data, meta, isLoading, error, refetch } =
 *   usePaginatedList<GestionCobro>('/cxc/gestiones-cobro', { page, limit: 10, search });
 */
export function usePaginatedList<T>(
  basePath: string,
  params: { page: number; limit: number; search?: string },
) {
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>(DEFAULT_META);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const query = buildQueryString({
      page: params.page,
      limit: params.limit,
      search: params.search,
    });

    apiClient
      .get<PaginatedResponse<T>>(`${basePath}${query}`)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la información');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, params.page, params.limit, params.search, refreshKey]);

  return { data, meta, isLoading, error, refetch };
}
