import { useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../../shared/ui-kit';

const TABS = [
  {
    id: 'condiciones',
    label: 'Condiciones de Crédito',
    path: '/cxc/credito/condiciones-credito',
  },
  {
    id: 'notas',
    label: 'Notas de Crédito',
    path: '/cxc/credito/notas-credito',
  },
  {
    id: 'aplicaciones',
    label: 'Aplicaciones de Nota',
    path: '/cxc/credito/aplicaciones-nota-credito',
  },
  {
    id: 'mora',
    label: 'Mora',
    path: '/cxc/credito/mora',
  },
];

const MODULE_ROUTES: Record<string, string> = {
  cuentas_cobrar: '/cxc/credito/condiciones-credito',
};

interface CreditoLayoutProps {
  children: React.ReactNode;
}

export const CreditoLayout = ({ children }: CreditoLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab =
    TABS.find((tab) => location.pathname.startsWith(tab.path))?.id ??
    TABS[0].id;

  return (
    <AppLayout
      activeModule="cuentas_cobrar"
      onSelectModule={(moduleId: string) =>
        navigate(MODULE_ROUTES[moduleId] ?? '/')
      }
      tabs={TABS.map(({ id, label }) => ({
        id,
        label,
      }))}
      activeTab={activeTab}
      onTabChange={(tabId: string) => {
        const tab = TABS.find((item) => item.id === tabId);

        if (tab) {
          navigate(tab.path);
        }
      }}
    >
      {children}
    </AppLayout>
  );
};