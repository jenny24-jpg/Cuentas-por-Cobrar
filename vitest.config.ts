import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pruebas de caja blanca de CxC: lógica pura, servicios y repositorios con
// Oracle simulado. Viven fuera de cada paquete para no entrar en sus builds.
export default defineConfig({
  resolve: {
    alias: {
      '@erp/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/caja-blanca/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'tests/caja-blanca/cobertura',
      include: [
        'packages/contracts/src/modules/cxc/validation.ts',
        'packages/contracts/src/modules/cxc/nit.ts',
        'server/src/modules/cxc/**/*.ts',
        'server/src/shared/date.ts',
        'server/src/shared/idParams.ts',
        'server/src/middlewares/errorHandler.ts',
        'client/src/shared/validation.ts',
      ],
      // Controladores y rutas solo enlazan HTTP con los servicios; se prueban de punta a punta (e2e).
      exclude: ['server/src/modules/cxc/controllers/**', 'server/src/modules/cxc/routes/**', '**/index.ts'],
    },
  },
});
