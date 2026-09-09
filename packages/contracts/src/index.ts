// Exportación unificada de todos los contratos y esquemas del ERP
export * from './common/pagination';
export * from './modules/compras';
export * from './modules/bancos';
export * from './modules/cxp';
export * from './modules/cxc';

// Reexportación explícita de constantes runtime (arrays de valores, no
// tipos) usadas por selects del frontend. Nota técnica: Vite/Rollup no
// logra resolver estáticamente valores en tiempo de build cuando llegan a
// través de 3+ niveles de `export *` encadenados hacia CommonJS (los tipos
// no tienen este problema porque se borran en compilación y nunca llegan
// al bundle). Si agregas un nuevo array de constantes (TIPOS_X, ESTADOS_X)
// que el frontend necesite en un <Select>, reexpórtalo aquí también.
export { TIPOS_GESTION_COBRO } from './modules/cxc/cobranza/gestion-cobro';
export { ESTADOS_PROMESA_PAGO } from './modules/cxc/cobranza/promesa-pago';
export { ESTADOS_CONVENIO_PAGO } from './modules/cxc/cobranza/convenio-pago';
export { ESTADOS_CUOTA } from './modules/cxc/cobranza/convenio-cuota';
export { ESTADOS_FORMA_PAGO } from './modules/cxc/pagos/forma-pago';
