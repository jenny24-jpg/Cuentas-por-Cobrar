// Configuración de rutas para el ERP Universitario
import type { RouteObject } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { EmpresasPage } from '../modules/cxc/organizacion/EmpresasPage';
import { SucursalesPage } from '../modules/cxc/organizacion/SucursalesPage';
import { RutasPage } from '../modules/cxc/organizacion/RutasPage';
import { RutaDetallePage } from '../modules/cxc/organizacion/RutaDetallePage';

export const routes: RouteObject[] = [
  {
    path: '/cxc/organizacion/empresas',
    element: <MainLayout><EmpresasPage /></MainLayout>,
  },
  {
    path: '/cxc/organizacion/sucursales',
    element: <MainLayout><SucursalesPage /></MainLayout>,
  },
  {
    path: '/cxc/organizacion/rutas',
    element: <MainLayout><RutasPage /></MainLayout>,
  },
  {
    path: '/cxc/organizacion/rutas/:id',
    element: <MainLayout><RutaDetallePage /></MainLayout>,
  },
];