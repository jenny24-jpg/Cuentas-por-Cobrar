// Configuración de rutas para el ERP Universitario
import type { RouteObject } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { CobranzaLayout } from '../modules/cxc/cobranza/cobranzaLayout';
import { GestionesCobroPage } from '../modules/cxc/cobranza/GestionesCobroPage';
import { PromesasPagoPage } from '../modules/cxc/cobranza/PromesasPagoPage';
import { ConveniosPagoPage } from '../modules/cxc/cobranza/ConveniosPagoPage';
import { ConvenioDetallePage } from '../modules/cxc/cobranza/ConvenioDetallePage';
import { CondicionesCreditoPage } from '../modules/cxc/credito/CondicionesCreditoPage';
import { NotasCreditoPage } from '../modules/cxc/credito/NotasCreditoPage';
import { AplicacionesNotaCreditoPage } from '../modules/cxc/credito/AplicacionesNotaCreditoPage';
import { MoraPage } from '../modules/cxc/credito/MoraPage';
import { CreditoLayout } from '../modules/cxc/credito/CreditoLayout';

// Cada módulo (compras, bancos, cxp, cxc) agrega sus rutas aquí, envueltas
// en MainLayout, como indica ARCHITECTURE.md sección 5.2. Dentro de eso,
// cada área usa su propio Layout (Sidebar/Navbar) construido sobre
// components/ui/AppLayout — ver CobranzaLayout.tsx como referencia.
export const routes: RouteObject[] = [
  // --- CXC / Cobranza ---
  {
    path: '/cxc/cobranza/gestiones-cobro',
    element: <MainLayout><CobranzaLayout><GestionesCobroPage /></CobranzaLayout></MainLayout>,
  },
  {
    path: '/cxc/cobranza/promesas-pago',
    element: <MainLayout><CobranzaLayout><PromesasPagoPage /></CobranzaLayout></MainLayout>,
  },
  {
    path: '/cxc/cobranza/convenios-pago',
    element: <MainLayout><CobranzaLayout><ConveniosPagoPage /></CobranzaLayout></MainLayout>,
  },
  {
    path: '/cxc/cobranza/convenios-pago/:id',
    element: <MainLayout><CobranzaLayout><ConvenioDetallePage /></CobranzaLayout></MainLayout>,
  },

  // --- CXC / Crédito ---
  {
  path: '/cxc/credito/condiciones-credito',
  element: (
    <CreditoLayout>
      <CondicionesCreditoPage />
    </CreditoLayout>
  ),
},
{
  path: '/cxc/credito/notas-credito',
  element: (
    <CreditoLayout>
      <NotasCreditoPage />
    </CreditoLayout>
  ),
},
{
  path: '/cxc/credito/aplicaciones-nota-credito',
  element: (
    <CreditoLayout>
      <AplicacionesNotaCreditoPage />
    </CreditoLayout>
  ),
},
{
  path: '/cxc/credito/mora',
  element: (
    <CreditoLayout>
      <MoraPage />
    </CreditoLayout>
  ),
},



  // --- Otros módulos: agregar aquí siguiendo el mismo patrón ---
  // { path: '/cxc/documentos', element: <MainLayout><DocumentosLayout><DocumentosPage /></DocumentosLayout></MainLayout> },   // Kevin
  // { path: '/cxc/pagos', element: <MainLayout><PagosLayout><PagosPage /></PagosLayout></MainLayout> },                        // Laura
  // { path: '/cxc/credito', element: <MainLayout><CreditoLayout><CreditoPage /></CreditoLayout></MainLayout> },                // Ángel
];