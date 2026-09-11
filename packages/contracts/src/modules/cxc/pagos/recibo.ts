import { z } from 'zod';
import { identifierSchema, isoDateSchema, moneySchema, optionalIdentifierSchema } from '../validation';

export const reciboSchema = z.object({
  idRecibo: z.number().int(),
  idCliente: z.number().int(),
  idPago: z.number().int(),
  numeroRecibo: z.string().nullable(),
  fecha: z.string(),
  monto: z.number(),
  estado: z.string(),
});
export type Recibo = z.infer<typeof reciboSchema>;

export const createReciboSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idPago: z.number().int().positive('El pago es obligatorio'),
  numeroRecibo: optionalIdentifierSchema('El número de recibo', 30),
  fecha: isoDateSchema('La fecha'),
  monto: moneySchema('El monto', true),
  estado: identifierSchema('El estado', 20).transform((value) => value.toUpperCase()),
});
export type CreateReciboInput = z.infer<typeof createReciboSchema>;

export const updateReciboSchema = createReciboSchema.partial();
export type UpdateReciboInput = z.infer<typeof updateReciboSchema>;
