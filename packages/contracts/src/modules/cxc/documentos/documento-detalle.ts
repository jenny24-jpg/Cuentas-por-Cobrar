import { z } from 'zod';

export const documentoDetalleSchema = z.object({
  idDetalle: z.number().int(),
  idDocumento: z.number().int(),
  codigoProducto: z.string().nullable(),
  descripcion: z.string(),
  cantidad: z.number(),
  precioUnitario: z.number(),
  total: z.number(),
});

export type DocumentoDetalle = z.infer<typeof documentoDetalleSchema>;

export const createDocumentoDetalleSchema = z.object({
  idDocumento: z.number().int().positive(),
  codigoProducto: z.string().trim().max(30).nullable().optional(),
  descripcion: z.string().trim().min(1, 'La descripción es obligatoria').max(200),
  cantidad: z.number().positive('La cantidad debe ser mayor que cero'),
  precioUnitario: z.number().nonnegative('El precio unitario no puede ser negativo'),
  total: z.number().nonnegative().optional(),
});

export type CreateDocumentoDetalleInput = z.infer<typeof createDocumentoDetalleSchema>;

export const updateDocumentoDetalleSchema = createDocumentoDetalleSchema
  .omit({ idDocumento: true })
  .partial();

export type UpdateDocumentoDetalleInput = z.infer<typeof updateDocumentoDetalleSchema>;
