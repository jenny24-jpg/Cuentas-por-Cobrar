import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ComponentShowcase } from '../components/ui/ComponentShowcase';
import { routes } from './routes';

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