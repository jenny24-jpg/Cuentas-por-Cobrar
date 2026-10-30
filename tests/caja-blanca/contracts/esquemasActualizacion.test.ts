import { describe, expect, it } from 'vitest';
import {
  updateConvenioPagoSchema,
  updatePromesaPagoSchema,
  updateNotaCreditoSchema,
  updatePagoSchema,
  updateConvenioCuotaSchema,
  updateCondicionCreditoSchema,
  updateTipoDocumentoSchema,
  updateEmpresaSchema,
  updateSucursalSchema,
  updateReciboSchema,
} from '@erp/contracts';
import { moneySchema } from '../../../packages/contracts/src/modules/cxc/validation';

/**
 * Un PATCH solo debe llevar los campos enviados. En Zod 4 un `.default()` sobrevive a
 * `.partial()`: si el esquema de edición hereda el default de la creación, editar
 * cualquier campo devuelve el registro a su estado inicial sin que nadie lo pida.
 */
describe('esquemas de edición: no inventan el estado', () => {
  it.each([
    ['convenio de pago', updateConvenioPagoSchema],
    ['nota de crédito', updateNotaCreditoSchema],
    ['pago', updatePagoSchema],
  ])('%s', (_n, schema) => {
    expect(schema.parse({})).not.toHaveProperty('estado');
  });

  // DEFECTO detectado en caja blanca: estos esquemas heredan el default.
  // `it.fails` pasa mientras el defecto exista; al corregirlo, cambiar a `it`.
  it.fails.each([
    ['recibo (CANCELADO → EMITIDO)', updateReciboSchema],
    ['promesa de pago (CUMPLIDA/INCUMPLIDA → PENDIENTE)', updatePromesaPagoSchema],
    ['cuota de convenio (→ PENDIENTE)', updateConvenioCuotaSchema],
    ['condición de crédito (I → A)', updateCondicionCreditoSchema],
    ['tipo de documento (I → A)', updateTipoDocumentoSchema],
    ['empresa (I → A)', updateEmpresaSchema],
    ['sucursal (I → A)', updateSucursalSchema],
  ])('DEFECTO %s', (_n, schema) => {
    expect(schema.parse({})).not.toHaveProperty('estado');
  });
});

/**
 * Las columnas de dinero en Oracle son NUMBER(12,2): el máximo es 9,999,999,999.99.
 * Un monto mayor debe rechazarse con un 400 claro y no llegar a Oracle (ORA-01438 → 500).
 */
describe('montos: tope de NUMBER(12,2)', () => {
  it('acepta el máximo de la columna', () => {
    expect(moneySchema('El monto', true).safeParse(9_999_999_999.99).success).toBe(true);
  });
  it.fails('DEFECTO: rechaza montos que no caben en la columna', () => {
    expect(moneySchema('El monto', true).safeParse(32_131_546_546_546_546).success).toBe(false);
  });
});
