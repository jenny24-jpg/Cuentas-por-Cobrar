import { useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../../shared/ui-kit';

const TABS = [
  { id: 'pagos', label: 'Pagos', path: '/cxc/pagos/pagos' },
  { id: 'aplicaciones', label: 'Aplicaciones de Pago', path: '/cxc/pagos/aplicaciones-pago' },
  { id: 'anticipos', label: 'Anticipos', path: '/cxc/pagos/anticipos' },
  { id: 'recibos', label: 'Recibos', path: '/cxc/pagos/recibos' },
  { id: 'formas-pago', label: 'Formas de Pago', path: '/cxc/pagos/formas-pago' },
];

const MODULE_ROUTES: Record<string, string> = {
  cuentas_cobrar: '/cxc/pagos/pagos',
};

interface PagosLayoutProps {
  children: React.ReactNode;
}

export const PagosLayout = ({ children }: PagosLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab =
    TABS.find((tab) => location.pathname.startsWith(tab.path))?.id ?? TABS[0].id;

  return (
    <AppLayout
      activeModule="cuentas_cobrar"
      onSelectModule={(moduleId: string) => navigate(MODULE_ROUTES[moduleId] ?? '/')}
      tabs={TABS.map(({ id, label }) => ({ id, label }))}
      activeTab={activeTab}
      onTabChange={(tabId: string) => {
        const tab = TABS.find((item) => item.id === tabId);
        if (tab) navigate(tab.path);
      }}
    >
      {children}
    </AppLayout>
  );
};
