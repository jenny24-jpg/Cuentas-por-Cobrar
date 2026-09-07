import { useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../../shared/ui-kit';

const TABS = [
  { id: 'documentos', label: 'Documentos', path: '/cxc/documentos/documentos' },
  { id: 'tipos', label: 'Tipos de Documento', path: '/cxc/documentos/tipos-documento' },
  { id: 'ajustes', label: 'Ajustes', path: '/cxc/documentos/ajustes' },
];

const MODULE_ROUTES: Record<string, string> = {
  cuentas_cobrar: '/cxc/documentos/documentos',
};

interface DocumentosLayoutProps {
  children: React.ReactNode;
}

export const DocumentosLayout = ({ children }: DocumentosLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab =
    TABS.find((t) => location.pathname.startsWith(t.path))?.id ?? TABS[0].id;

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
