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
        <PagosPage />
      </MainLayout>
    ),
  },
  {
    path: '/cxc/pagos/aplicaciones-pago',
    element: (
      <MainLayout>
        <AplicacionesPagoPage />
      </MainLayout>
    ),
  },
  {
    path: '/cxc/pagos/anticipos',
    element: (
      <MainLayout>
        <AnticiposPage />
      </MainLayout>
    ),
  },
  {
    path: '/cxc/pagos/recibos',
    element: (
      <MainLayout>
        <RecibosPage />
      </MainLayout>
    ),
  },
  {
    path: '/cxc/pagos/formas-pago',
    element: (
      <MainLayout>
        <FormasPagoPage />
      </MainLayout>
    ),
  },

  // --- Otros módulos: agregar aquí siguiendo el mismo patrón ---
  // { path: '/cxc/documentos', element: <MainLayout><DocumentosPage /></MainLayout> }, // Kevin
  // { path: '/cxc/credito', element: <MainLayout><CreditoPage /></MainLayout> },       // Ángel
];