import { useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../../shared/ui-kit';

/**
 * Pestañas de navegación DENTRO del módulo de Organización (Navbar
 * superior). Si se agregan más pantallas, se agregan aquí.
 */
const TABS = [
  { id: 'empresas', label: 'Empresas', path: '/cxc/organizacion/empresas' },
  { id: 'sucursales', label: 'Sucursales', path: '/cxc/organizacion/sucursales' },
  { id: 'rutas', label: 'Rutas', path: '/cxc/organizacion/rutas' },
];

const MODULE_ROUTES: Record<string, string> = {
  cuentas_cobrar: '/cxc/organizacion/empresas',
};

interface OrganizacionLayoutProps {
  children: React.ReactNode;
}

export const OrganizacionLayout = ({ children }: OrganizacionLayoutProps) => {
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