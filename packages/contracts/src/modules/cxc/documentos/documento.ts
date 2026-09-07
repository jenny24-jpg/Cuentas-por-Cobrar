import { z } from 'zod';

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

export type Documento = z.infer<typeof documentoSchema>;

export const createDocumentoSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  nitCliente: z.string().trim().max(20).nullable().optional(),
  idTipoDocumento: z.number().int().positive('Selecciona un tipo de documento'),
  idMoneda: z.number().int().positive('Selecciona una moneda'),
  estado: z.string().trim().min(1, 'El estado es obligatorio').max(30).default('PENDIENTE'),
  serie: z.string().trim().max(30).nullable().optional(),
  numeroDocumento: z.string().trim().min(1, 'El número de documento es obligatorio').max(50),
  fechaDocumento: z.string().min(1, 'La fecha del documento es obligatoria'),
  fechaVencimiento: z.string().min(1, 'La fecha de vencimiento es obligatoria'),
  total: z.number().nonnegative('El total no puede ser negativo'),
  saldo: z.number().nonnegative('El saldo no puede ser negativo').optional(),
});

export type CreateDocumentoInput = z.infer<typeof createDocumentoSchema>;

export const updateDocumentoSchema = createDocumentoSchema.partial();
export type UpdateDocumentoInput = z.infer<typeof updateDocumentoSchema>;
