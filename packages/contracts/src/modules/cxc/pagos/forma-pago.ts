import { z } from 'zod';
export const REQUIERE_REFERENCIA_FORMA_PAGO = ['S', 'N'] as const;
export const ESTADOS_FORMA_PAGO = ['A', 'I'] as const;

/**
 * Catálogo estándar de formas de pago: el nombre se elige de esta lista (no texto libre)
 * y si requiere referencia lo define la propia forma, no el usuario.
 */
export const FORMAS_PAGO_ESTANDAR = [
  { nombre: 'Efectivo', requiereReferencia: 'N' },
  { nombre: 'Transferencia bancaria', requiereReferencia: 'S' },
  { nombre: 'Depósito bancario', requiereReferencia: 'S' },
  { nombre: 'Cheque', requiereReferencia: 'S' },
  { nombre: 'Tarjeta de crédito o débito', requiereReferencia: 'S' },
] as const;
const NOMBRES_FORMA_PAGO = FORMAS_PAGO_ESTANDAR.map((f) => f.nombre) as unknown as [string, ...string[]];

export const formaPagoSchema = z.object({
  idFormaPago: z.number().int(), nombre: z.string(), requiereReferencia: z.enum(REQUIERE_REFERENCIA_FORMA_PAGO), estado: z.enum(ESTADOS_FORMA_PAGO),
});
export type FormaPago = z.infer<typeof formaPagoSchema>;
export const createFormaPagoSchema = z.object({
  nombre: z.enum(NOMBRES_FORMA_PAGO, { error: 'Selecciona una forma de pago del catálogo estándar' }),
  estado: z.enum(ESTADOS_FORMA_PAGO),
}).transform((input) => ({
  ...input,
  requiereReferencia: FORMAS_PAGO_ESTANDAR.find((f) => f.nombre === input.nombre)!.requiereReferencia,
}));
export type CreateFormaPagoInput = z.infer<typeof createFormaPagoSchema>;
/** Al editar solo cambia el estado: el nombre identifica la forma estándar. */
export const updateFormaPagoSchema = z.object({ estado: z.enum(ESTADOS_FORMA_PAGO) });
export type UpdateFormaPagoInput = z.infer<typeof updateFormaPagoSchema>;
