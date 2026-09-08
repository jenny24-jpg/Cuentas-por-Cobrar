import { z } from 'zod';

export const ESTADOS_CONDICION_CREDITO = ['A', 'I'] as const;

export const condicionCreditoSchema = z.object({
  idCondicion: z.number().int(),
  diasCredito: z.number().int(),
  porcentajeMora: z.number(),
  diasGracia: z.number().int(),
  estado: z.enum(ESTADOS_CONDICION_CREDITO),
});

export type CondicionCredito = z.infer<typeof condicionCreditoSchema>;

export const createCondicionCreditoSchema = z.object({
  diasCredito: z.number().int().min(0),
  porcentajeMora: z.number().min(0),
  diasGracia: z.number().int().min(0),
  estado: z.enum(ESTADOS_CONDICION_CREDITO).default('A'),
});

export type CreateCondicionCreditoInput =
  z.infer<typeof createCondicionCreditoSchema>;

export const updateCondicionCreditoSchema =
  createCondicionCreditoSchema.partial();

export type UpdateCondicionCreditoInput =
  z.infer<typeof updateCondicionCreditoSchema>;