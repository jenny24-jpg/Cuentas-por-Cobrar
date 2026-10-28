import { useState, useEffect, useCallback } from 'react';
import { apiClient, buildQueryString, ApiError } from '../api';
import type { PaginatedResponse, PaginationMeta } from '@erp/contracts';

const DEFAULT_META: PaginationMeta = { page: 1, limit: 10, total: 0, totalPages: 1 };
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Listado paginado reutilizable con búsqueda desacoplada de la escritura.
 * El debounce evita disparar una consulta Oracle por cada tecla y el
 * AbortController cancela la petición anterior al cambiar de filtro/página.
 */
export function usePaginatedList<T>(
  basePath: string,
  /** Además de page/limit/search admite filtros extra (p. ej. estado, idEmpleado) que viajan en la query. */
  params: { page: number; limit: number; search?: string; [filtro: string]: string | number | undefined },
) {
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>(DEFAULT_META);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState(params.search ?? '');

  const refetch = useCallback(() => setRefreshKey((key) => key + 1), []);

  // Filtros extra serializados: cambian la consulta solo cuando cambia su valor, no la referencia del objeto.
  const { page, limit, search: _search, ...extras } = params;
  const filtrosKey = JSON.stringify(extras);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(params.search?.trim() ?? ''), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [params.search]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    const query = buildQueryString({
      ...(JSON.parse(filtrosKey) as Record<string, string | number | undefined>),
      page,
      limit,
      search: debouncedSearch,
    });

    apiClient
      .get<PaginatedResponse<T>>(`${basePath}${query}`, { signal: controller.signal })
      .then((res) => {
        setData(res.data);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la información');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [basePath, page, limit, debouncedSearch, filtrosKey, refreshKey]);

  return { data, meta, isLoading, error, refetch };
}
