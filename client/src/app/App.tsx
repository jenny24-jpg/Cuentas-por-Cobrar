import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ComponentShowcase } from '../components/ui/ComponentShowcase';
import { routes } from './routes';

// '/' se queda en el showcase del kit de componentes mientras no exista un
// dashboard real. Los módulos de cada equipo (compras, bancos, cxp, cxc)
// viven en sus propias rutas — ver routes.tsx.
const router = createBrowserRouter([
  { path: '/', element: <ComponentShowcase /> },
  ...routes,
]);

export default function App() {
  return (
    <div className="erp-app min-h-screen bg-slate-50">
      <RouterProvider router={router} />
    </div>
  );
}
