import { z } from 'zod';
import { identifierSchema, isoDateSchema, moneySchema, optionalIdentifierSchema } from '../validation';

export const pagoSchema = z.object({
  idPago: z.number().int(),
  idCliente: z.number().int(),
  idFormaPago: z.number().int(),
  idMoneda: z.number().int(),
  idBanco: z.number().int().nullable(),
  fechaPago: z.string(),
  monto: z.number(),
  numeroReferencia: z.string().nullable(),
  estado: z.string(),
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
  // ESTADO aún es VARCHAR2 libre en el esquema recibido; restringimos el
  // formato para impedir texto/símbolos arbitrarios sin inventar un enum.
  estado: identifierSchema('El estado', 20).transform((value) => value.toUpperCase()),
});
export type CreatePagoInput = z.infer<typeof createPagoSchema>;

export const updatePagoSchema = createPagoSchema.partial();
export type UpdatePagoInput = z.infer<typeof updatePagoSchema>;
