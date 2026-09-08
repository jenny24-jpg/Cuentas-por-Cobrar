import { z } from 'zod';

export const aplicacionNotaCreditoSchema = z.object({
  idAplicacionNc: z.number().int(),
  idNotaCredito: z.number().int(),
  idDocumento: z.number().int(),
  montoAplicado: z.number(),
  fechaAplicacion: z.string(),
});

export type AplicacionNotaCredito =
  z.infer<typeof aplicacionNotaCreditoSchema>;

export const createAplicacionNotaCreditoSchema = z.object({
  idNotaCredito: z
    .number()
    .int()
    .positive('La nota de crédito es obligatoria'),

  idDocumento: z
    .number()
    .int()
    .positive('El documento es obligatorio'),

  montoAplicado: z
    .number()
    .positive('El monto aplicado debe ser mayor que 0'),

  fechaAplicacion: z
    .string()
    .min(1, 'La fecha de aplicación es obligatoria'),
});

export type CreateAplicacionNotaCreditoInput =
  z.infer<typeof createAplicacionNotaCreditoSchema>;

export const updateAplicacionNotaCreditoSchema =
  createAplicacionNotaCreditoSchema.partial();

export type UpdateAplicacionNotaCreditoInput =
  z.infer<typeof updateAplicacionNotaCreditoSchema>;