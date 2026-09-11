import { z } from 'zod';
import {
  isoDateSchema,
  moneySchema,
  optionalIdentifierSchema,
  optionalTrimmedText,
} from '../validation';

export const ESTADOS_NOTA_CREDITO = ['ACTIVA', 'ANULADA'] as const;

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
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idDocumentoReferencia: z.number().int().positive('Selecciona un documento válido').nullable().optional(),
  descripcion: optionalTrimmedText('La descripción', 250),
  serie: optionalIdentifierSchema('La serie', 30),
  numero: optionalIdentifierSchema('El número', 30),
  fecha: isoDateSchema('La fecha'),
  monto: moneySchema('El monto', true),
  estado: z.enum(ESTADOS_NOTA_CREDITO).default('ACTIVA'),
});

export type CreateNotaCreditoInput = z.infer<typeof createNotaCreditoSchema>;
export const updateNotaCreditoSchema = createNotaCreditoSchema.partial();
export type UpdateNotaCreditoInput = z.infer<typeof updateNotaCreditoSchema>;
