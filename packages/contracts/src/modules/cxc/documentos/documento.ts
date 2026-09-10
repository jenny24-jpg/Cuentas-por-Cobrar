import { z } from 'zod';
import {
  isoDateSchema,
  moneySchema,
  optionalIdentifierSchema,
  identifierSchema,
} from '../validation';

export const ESTADOS_DOCUMENTO = [
  'PENDIENTE',
  'PARCIAL',
  'PAGADO',
  'VENCIDO',
  'ANULADO',
] as const;

export const documentoSchema = z.object({
  idDocumento: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  nitCliente: z.string().nullable(),
  idTipoDocumento: z.number().int(),
  nombreTipoDocumento: z.string().nullable().optional(),
  idMoneda: z.number().int(),
  estado: z.string(),
  serie: z.string().nullable(),
  numeroDocumento: z.string(),
  fechaDocumento: z.string(),
  fechaVencimiento: z.string(),
  total: z.number(),
  saldo: z.number(),
});

const documentoInputBaseSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  // El NIT es una fotografía del dato maestro. El backend lo deriva del
  // cliente seleccionado; se conserva opcional para compatibilidad.
  nitCliente: z.string().trim().max(20).nullable().optional(),
  idTipoDocumento: z.number().int().positive('Selecciona un tipo de documento'),
  idMoneda: z.number().int().positive('Selecciona una moneda'),
  estado: z.enum(ESTADOS_DOCUMENTO).default('PENDIENTE'),
  serie: optionalIdentifierSchema('La serie', 30),
  numeroDocumento: identifierSchema('El número de documento', 50),
  fechaDocumento: isoDateSchema('La fecha del documento'),
  fechaVencimiento: isoDateSchema('La fecha de vencimiento'),
  total: moneySchema('El total', true),
  saldo: moneySchema('El saldo').optional(),
});

export const createDocumentoSchema = documentoInputBaseSchema.superRefine((data, ctx) => {
  if (data.fechaVencimiento < data.fechaDocumento) {
    ctx.addIssue({
      code: 'custom',
      path: ['fechaVencimiento'],
      message: 'La fecha de vencimiento no puede ser anterior a la fecha del documento',
    });
  }

  const saldo = data.saldo ?? data.total;
  if (saldo > data.total) {
    ctx.addIssue({
      code: 'custom',
      path: ['saldo'],
      message: 'El saldo no puede ser mayor que el total del documento',
    });
  }
});

export type CreateDocumentoInput = z.infer<typeof createDocumentoSchema>;

export const updateDocumentoSchema = documentoInputBaseSchema.partial();
export type UpdateDocumentoInput = z.infer<typeof updateDocumentoSchema>;
