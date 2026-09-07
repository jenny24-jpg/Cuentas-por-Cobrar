# Rama documentos-catalogos — Kevin

Este paquete contiene la base común del proyecto y únicamente el módulo CXC de Kevin:

- CXC_DOCUMENTOS
- CXC_DOCUMENTO_DETALLE
- CXC_DOCUMENTO_HISTORIAL
- CXC_TIPOS_DOCUMENTO
- CXC_AJUSTES

No incluye los CRUD funcionales de Pagos, Crédito, Cobranza u Organización.

Incluye los archivos base necesarios solicitados:
- client/package.json
- client/src/app/App.tsx
- client/src/layouts/MainLayout.tsx
- client/src/shared/api/index.ts
- client/src/shared/ui-kit.ts
- server/package.json
- server/src/config/database.ts
- packages/contracts/package.json

También conserva componentes compartidos y configuración base necesarios para que el módulo de Documentos pueda integrarse y compilarse.
