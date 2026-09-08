// Configuración de rutas para el ERP Universitario
import type { RouteObject } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';

// --- CXC / Cobranza ---
import { GestionesCobroPage } from '../modules/cxc/cobranza/GestionesCobroPage';
import { PromesasPagoPage } from '../modules/cxc/cobranza/PromesasPagoPage';
import { ConveniosPagoPage } from '../modules/cxc/cobranza/ConveniosPagoPage';
import { ConvenioDetallePage } from '../modules/cxc/cobranza/ConvenioDetallePage';

// --- CXC / Pagos ---
import { PagosPage } from '../modules/cxc/pagos/PagosPage';
import { AplicacionesPagoPage } from '../modules/cxc/pagos/AplicacionesPagoPage';
import { AnticiposPage } from '../modules/cxc/pagos/AnticiposPage';
import { RecibosPage } from '../modules/cxc/pagos/RecibosPage';
import { FormasPagoPage } from '../modules/cxc/pagos/FormasPagoPage';
import { PagosLayout } from '../modules/cxc/pagos/PagosLayout';

// Cada módulo (compras, bancos, cxp, cxc) agrega sus rutas aquí, envueltas
// en MainLayout, como indica ARCHITECTURE.md sección 5.2.
export const routes: RouteObject[] = [
  // --- CXC / Cobranza ---
  {
    path: '/cxc/cobranza/gestiones-cobro',
    element: (
      <MainLayout>
        <GestionesCobroPage />
      </MainLayout>
    ),
  },
  {
    path: '/cxc/cobranza/promesas-pago',
    element: (
      <MainLayout>
        <PromesasPagoPage />
      </MainLayout>
    ),
  },
  {
    path: '/cxc/cobranza/convenios-pago',
    element: (
      <MainLayout>
        <ConveniosPagoPage />
      </MainLayout>
    ),
  },
  {
    path: '/cxc/cobranza/convenios-pago/:id',
    element: (
      <MainLayout>
        <ConvenioDetallePage />
      </MainLayout>
    ),
  },

  // --- CXC / Pagos ---
  {
    path: '/cxc/pagos/pagos',
    element: (
      <MainLayout>
        <PagosLayout><PagosPage /></PagosLayout>
      </MainLayout>
    ),
  },
  {
    path: '/cxc/pagos/aplicaciones-pago',
    element: (
      <MainLayout>
        <PagosLayout><AplicacionesPagoPage /></PagosLayout>
      </MainLayout>
    ),
  },
  {
    path: '/cxc/pagos/anticipos',
    element: (
      <MainLayout>
        <PagosLayout><AnticiposPage /></PagosLayout>
      </MainLayout>
    ),
  },
  {
    path: '/cxc/pagos/recibos',
    element: (
      <MainLayout>
        <PagosLayout><RecibosPage /></PagosLayout>
      </MainLayout>
    ),
  },
  {
    path: '/cxc/pagos/formas-pago',
    element: (
      <MainLayout>
        <PagosLayout><FormasPagoPage /></PagosLayout>
      </MainLayout>
    ),
  },

  // --- Otros módulos: agregar aquí siguiendo el mismo patrón ---
  // { path: '/cxc/documentos', element: <MainLayout><DocumentosPage /></MainLayout> }, // Kevin
  // { path: '/cxc/credito', element: <MainLayout><CreditoPage /></MainLayout> },       // Ángel
];
