import { z } from 'zod';

export const ESTADOS_TIPO_DOCUMENTO = ['A', 'I'] as const;

export const tipoDocumentoSchema = z.object({
  idTipoDocumento: z.number().int(),
  codigo: z.string(),
  nombre: z.string(),
  naturaleza: z.string().nullable(),
  estado: z.string(),
});

export type TipoDocumento = z.infer<typeof tipoDocumentoSchema>;

export const createTipoDocumentoSchema = z.object({
  codigo: z.string().trim().min(1, 'El código es obligatorio').max(20),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  naturaleza: z.string().trim().max(20).nullable().optional(),
  estado: z.enum(ESTADOS_TIPO_DOCUMENTO).default('A'),
});

export type CreateTipoDocumentoInput = z.infer<typeof createTipoDocumentoSchema>;

export const updateTipoDocumentoSchema = createTipoDocumentoSchema.partial();
export type UpdateTipoDocumentoInput = z.infer<typeof updateTipoDocumentoSchema>;
