import { z } from 'zod';
import { identifierSchema, isoDateSchema, moneySchema } from '../validation';

export const anticipoSchema = z.object({
  idAnticipo: z.number().int(),
  idCliente: z.number().int(),
  idPago: z.number().int().nullable(),
  montoOriginal: z.number(),
  montoDisponible: z.number(),
  fecha: z.string(),
  estado: z.string(),
});
export type Anticipo = z.infer<typeof anticipoSchema>;

const anticipoBaseSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idPago: z.number().int().positive().nullable().optional(),
  montoOriginal: moneySchema('El monto original', true),
  montoDisponible: moneySchema('El monto disponible'),
  fecha: isoDateSchema('La fecha'),
  estado: identifierSchema('El estado', 20).transform((value) => value.toUpperCase()),
});

export const createAnticipoSchema = anticipoBaseSchema.superRefine((value, ctx) => {
  if (value.montoDisponible > value.montoOriginal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['montoDisponible'],
      message: 'El monto disponible no puede superar el monto original',
    });
  }
});
export type CreateAnticipoInput = z.infer<typeof createAnticipoSchema>;

export const updateAnticipoSchema = anticipoBaseSchema.partial();
export type UpdateAnticipoInput = z.infer<typeof updateAnticipoSchema>;
