// Configuración de rutas para el ERP Universitario
import type { RouteObject } from 'react-router-dom';
import { OrganizacionLayout } from '../modules/cxc/organizacion/organizacionLayout';
import { EmpresasPage } from '../modules/cxc/organizacion/EmpresasPage';
import { SucursalesPage } from '../modules/cxc/organizacion/SucursalesPage';
import { RutasPage } from '../modules/cxc/organizacion/RutasPage';
import { RutaDetallePage } from '../modules/cxc/organizacion/RutaDetallePage';

export const routes: RouteObject[] = [
  {
    path: '/cxc/organizacion/empresas',
    element: <OrganizacionLayout><EmpresasPage /></OrganizacionLayout>,
  },
  {
    path: '/cxc/organizacion/sucursales',
    element: <OrganizacionLayout><SucursalesPage /></OrganizacionLayout>,
  },
  {
    path: '/cxc/organizacion/rutas',
    element: <OrganizacionLayout><RutasPage /></OrganizacionLayout>,
  },
  {
    path: '/cxc/organizacion/rutas/:id',
    element: <OrganizacionLayout><RutaDetallePage /></OrganizacionLayout>,
  },
];