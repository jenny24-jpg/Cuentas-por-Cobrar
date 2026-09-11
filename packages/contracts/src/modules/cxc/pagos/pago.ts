import { z } from 'zod';
import { isoDateSchema, moneySchema, optionalIdentifierSchema } from '../validation';

export const ESTADOS_PAGO = ['PENDIENTE', 'ACTIVO', 'APLICADO', 'CANCELADO'] as const;

export const pagoSchema = z.object({
  idPago: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  idFormaPago: z.number().int(),
  idMoneda: z.number().int(),
  idBanco: z.number().int().nullable(),
  fechaPago: z.string(),
  monto: z.number(),
  numeroReferencia: z.string().nullable(),
  estado: z.enum(ESTADOS_PAGO),
});
export type Pago = z.infer<typeof pagoSchema>;

export const createPagoSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idFormaPago: z.number().int().positive('Selecciona una forma de pago'),
  idMoneda: z.number().int().positive('Selecciona una moneda'),
  idBanco: z.number().int().positive('El banco debe ser un ID válido').nullable().optional(),
  fechaPago: isoDateSchema('La fecha de pago'),
  monto: moneySchema('El monto', true),
  numeroReferencia: optionalIdentifierSchema('La referencia', 80),
  estado: z.enum(ESTADOS_PAGO).default('PENDIENTE'),
});
export type CreatePagoInput = z.infer<typeof createPagoSchema>;

export const updatePagoSchema = createPagoSchema.partial();
export type UpdatePagoInput = z.infer<typeof updatePagoSchema>;
