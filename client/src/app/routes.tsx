// Configuración de rutas para el ERP Universitario
import type { RouteObject } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { GestionesCobroPage } from '../modules/cxc/cobranza/GestionesCobroPage';
import { PromesasPagoPage } from '../modules/cxc/cobranza/PromesasPagoPage';
import { ConveniosPagoPage } from '../modules/cxc/cobranza/ConveniosPagoPage';
import { ConvenioDetallePage } from '../modules/cxc/cobranza/ConvenioDetallePage';

// Cada módulo (compras, bancos, cxp, cxc) agrega sus rutas aquí, envueltas
// en MainLayout, como indica ARCHITECTURE.md sección 5.2.
export const routes: RouteObject[] = [
  // --- CXC / Cobranza ---
  {
    path: '/cxc/cobranza/gestiones-cobro',
    element: <MainLayout><GestionesCobroPage /></MainLayout>,
  },
  {
    path: '/cxc/cobranza/promesas-pago',
    element: <MainLayout><PromesasPagoPage /></MainLayout>,
  },
  {
    path: '/cxc/cobranza/convenios-pago',
    element: <MainLayout><ConveniosPagoPage /></MainLayout>,
  },
  {
    path: '/cxc/cobranza/convenios-pago/:id',
    element: <MainLayout><ConvenioDetallePage /></MainLayout>,
  },

  // --- Otros módulos: agregar aquí siguiendo el mismo patrón ---
  // { path: '/cxc/documentos', element: <MainLayout><DocumentosPage /></MainLayout> },   // Kevin
  // { path: '/cxc/pagos', element: <MainLayout><PagosPage /></MainLayout> },              // Laura
  // { path: '/cxc/credito', element: <MainLayout><CreditoPage /></MainLayout> },          // Ángel
];
