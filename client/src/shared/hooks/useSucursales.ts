import { useEffect, useState } from 'react';
import { apiClient } from '../api';
import type { PaginatedResponse, Sucursal } from '@erp/contracts';

export interface SucursalOpcion {
  id: number;
  nombre: string;
  empresa: string | null;
  activa: boolean;
}

/** Sucursales para poblar selectores y filtros. Por defecto solo las activas. */
export function useSucursales(soloActivas = true): SucursalOpcion[] {
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);

  useEffect(() => {
    let vigente = true;
    apiClient.get<PaginatedResponse<Sucursal>>('/cxc/sucursales?limit=100')
      .then((r) => {
        if (!vigente) return;
        const todas = r.data.map((s) => ({ id: s.idSucursal, nombre: s.nombre, empresa: s.nombreEmpresa ?? null, activa: s.estado === 'A' }));
        setSucursales(soloActivas ? todas.filter((s) => s.activa) : todas);
      })
      .catch(() => { if (vigente) setSucursales([]); });
    return () => { vigente = false; };
  }, [soloActivas]);

  return sucursales;
}
