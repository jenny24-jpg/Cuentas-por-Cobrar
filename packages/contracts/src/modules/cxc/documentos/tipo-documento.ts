import { z } from 'zod';

export const ESTADOS_TIPO_DOCUMENTO = ['A', 'I'] as const;
export const NATURALEZAS_DOCUMENTO = ['CARGO', 'CREDITO'] as const;

/**
 * El código es también la serie de los documentos de ese tipo (FACT-00000001), así que
 * se restringe a 2–6 letras mayúsculas, sin números ni signos.
 */
export const CODIGO_TIPO_DOCUMENTO_REGEX = /^[A-Z]{2,6}$/;
export const CODIGO_TIPO_DOCUMENTO_MENSAJE = 'El código debe tener de 2 a 6 letras mayúsculas, sin números, espacios ni signos (ej. FACT, ND, PAG)';

export const tipoDocumentoSchema = z.object({
  idTipoDocumento: z.number().int(),
  codigo: z.string(),
  nombre: z.string(),
  naturaleza: z.string().nullable(),
  estado: z.string(),
});
export type TipoDocumento = z.infer<typeof tipoDocumentoSchema>;

export const createTipoDocumentoSchema = z.object({
  codigo: z.string().trim().toUpperCase().regex(CODIGO_TIPO_DOCUMENTO_REGEX, CODIGO_TIPO_DOCUMENTO_MENSAJE),
  nombre: z.string().trim().min(3, 'El nombre es obligatorio (mínimo 3 caracteres)').max(80)
    .regex(/^[\p{L}][\p{L}\s]*$/u, 'El nombre solo admite letras y espacios'),
  naturaleza: z.enum(NATURALEZAS_DOCUMENTO, { error: 'Selecciona la naturaleza: CARGO o CREDITO' }),
  estado: z.enum(ESTADOS_TIPO_DOCUMENTO).default('A'),
});
export type CreateTipoDocumentoInput = z.infer<typeof createTipoDocumentoSchema>;

export const updateTipoDocumentoSchema = createTipoDocumentoSchema.partial();
export type UpdateTipoDocumentoInput = z.infer<typeof updateTipoDocumentoSchema>;
