import { z } from 'zod';

export const ESTADOS_NOTA_CREDITO = [
  'ACTIVA',
  'ANULADA',
] as const;

export const notaCreditoSchema = z.object({
  idNotaCredito: z.number().int(),
  idCliente: z.number().int(),
  idDocumentoReferencia: z.number().int().nullable(),
  descripcion: z.string().nullable(),
  serie: z.string().nullable(),
  numero: z.string().nullable(),
  fecha: z.string(),
  monto: z.number(),
  estado: z.enum(ESTADOS_NOTA_CREDITO),
});

export type NotaCredito = z.infer<typeof notaCreditoSchema>;

export const createNotaCreditoSchema = z.object({
  idCliente: z.number().int().positive(),
  idDocumentoReferencia: z.number().int().positive().nullable().optional(),
  descripcion: z.string().max(250).nullable().optional(),
  serie: z.string().max(30).nullable().optional(),
  numero: z.string().max(30).nullable().optional(),
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  monto: z.number().positive('El monto debe ser mayor que 0'),
  estado: z.enum(ESTADOS_NOTA_CREDITO).default('ACTIVA'),
});

export type CreateNotaCreditoInput =
  z.infer<typeof createNotaCreditoSchema>;

export const updateNotaCreditoSchema =
  createNotaCreditoSchema.partial();

export type UpdateNotaCreditoInput =
  z.infer<typeof updateNotaCreditoSchema>;