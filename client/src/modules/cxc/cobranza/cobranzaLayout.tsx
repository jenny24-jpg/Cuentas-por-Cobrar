import { useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../../shared/ui-kit';

/**
 * Pestañas de navegación DENTRO del módulo de Cobranza (las que se ven en el
 * Navbar superior). Si el equipo agrega más pantallas a Cobranza, se agregan
 * aquí. Las demás áreas de CXC (Documentos, Pagos, Crédito) tendrán su
 * propio layout análogo a este cuando alguien las construya — no las
 * agrego yo porque no existen sus pantallas todavía.
 */
const TABS = [
  { id: 'gestiones', label: 'Gestiones de Cobro', path: '/cxc/cobranza/gestiones-cobro' },
  { id: 'promesas', label: 'Promesas de Pago', path: '/cxc/cobranza/promesas-pago' },
  { id: 'convenios', label: 'Convenios de Pago', path: '/cxc/cobranza/convenios-pago' },
];

/**
 * El Sidebar del kit tiene sus módulos grandes fijos en el código
 * (dashboard, compras, inventario, cuentas_pagar, cuentas_cobrar, bancos).
 * Mapeamos cada uno a una ruta real; los que ningún compañero ha construido
 * todavía (compras, inventario, cuentas_pagar, bancos) caen al inicio ('/')
 * en lo que se arman esas pantallas.
 */
const MODULE_ROUTES: Record<string, string> = {
  cuentas_cobrar: '/cxc/cobranza/gestiones-cobro',
};

interface CobranzaLayoutProps {
  children: React.ReactNode;
}

/**
 * Envuelve cualquier pantalla de Cobranza con el Sidebar + Navbar reales del
 * kit (components/ui/AppLayout). No se modifica ese archivo — solo se usa,
 * tal como indica FRONTEND_GUIDELINES.md.
 *
 * Uso: en routes.tsx, <CobranzaLayout><GestionesCobroPage /></CobranzaLayout>
 */
export const CobranzaLayout = ({ children }: CobranzaLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = TABS.find((t) => location.pathname.startsWith(t.path))?.id ?? TABS[0].id;

  return (
    <AppLayout
      activeModule="cuentas_cobrar"
      onSelectModule={(moduleId: string) => navigate(MODULE_ROUTES[moduleId] ?? '/')}
      tabs={TABS.map(({ id, label }) => ({ id, label }))}
      activeTab={activeTab}
      onTabChange={(tabId: string) => {
        const tab = TABS.find((t) => t.id === tabId);
        if (tab) navigate(tab.path);
      }}
    >
      {children}
    </AppLayout>
  );
};