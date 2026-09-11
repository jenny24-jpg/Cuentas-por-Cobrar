import { z } from 'zod';
import { isoDateSchema, moneySchema } from '../validation';

export const aplicacionNotaCreditoSchema = z.object({
  idAplicacionNc: z.number().int(),
  idNotaCredito: z.number().int(),
  idDocumento: z.number().int(),
  montoAplicado: z.number(),
  fechaAplicacion: z.string(),
});

export type AplicacionNotaCredito = z.infer<typeof aplicacionNotaCreditoSchema>;

export const createAplicacionNotaCreditoSchema = z.object({
  idNotaCredito: z.number().int().positive('La nota de crédito es obligatoria'),
  idDocumento: z.number().int().positive('El documento es obligatorio'),
  montoAplicado: moneySchema('El monto aplicado', true),
  fechaAplicacion: isoDateSchema('La fecha de aplicación'),
});

export type CreateAplicacionNotaCreditoInput = z.infer<typeof createAplicacionNotaCreditoSchema>;

export const updateAplicacionNotaCreditoSchema = createAplicacionNotaCreditoSchema.partial();
export type UpdateAplicacionNotaCreditoInput = z.infer<typeof updateAplicacionNotaCreditoSchema>;
