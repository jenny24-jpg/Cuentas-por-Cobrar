import type { RouteObject } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';

import { DocumentosLayout } from '../modules/cxc/documentos/documentosLayout';
import { DocumentosPage } from '../modules/cxc/documentos/DocumentosPage';
import { DocumentoDetallePage } from '../modules/cxc/documentos/DocumentoDetallePage';
import { TiposDocumentoPage } from '../modules/cxc/documentos/TiposDocumentoPage';
import { AjustesPage } from '../modules/cxc/documentos/AjustesPage';

export const routes: RouteObject[] = [
  {
    path: '/cxc/documentos/documentos',
    element: (
      <MainLayout>
        <DocumentosLayout>
          <DocumentosPage />
        </DocumentosLayout>
      </MainLayout>
    ),
  },
  {
    path: '/cxc/documentos/documentos/:id',
    element: (
      <MainLayout>
        <DocumentosLayout>
          <DocumentoDetallePage />
        </DocumentosLayout>
      </MainLayout>
    ),
  },
  {
    path: '/cxc/documentos/tipos-documento',
    element: (
      <MainLayout>
        <DocumentosLayout>
          <TiposDocumentoPage />
        </DocumentosLayout>
      </MainLayout>
    ),
  },
  {
    path: '/cxc/documentos/ajustes',
    element: (
      <MainLayout>
        <DocumentosLayout>
          <AjustesPage />
        </DocumentosLayout>
      </MainLayout>
    ),
  },
];