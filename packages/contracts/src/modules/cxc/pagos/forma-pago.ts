import { z } from 'zod';
export const REQUIERE_REFERENCIA_FORMA_PAGO = ['S', 'N'] as const;
export const ESTADOS_FORMA_PAGO = ['A', 'I'] as const;

/**
 * El catálogo de formas de pago vive en CXC_FORMAS_PAGO: el código no trae una lista
 * fija. La estandarización la da la base (nombre único, sin repetir con otra
 * mayúscula o tilde) y cada forma guarda si exige referencia.
 */
export const formaPagoSchema = z.object({
  idFormaPago: z.number().int(), nombre: z.string(), requiereReferencia: z.enum(REQUIERE_REFERENCIA_FORMA_PAGO), estado: z.enum(ESTADOS_FORMA_PAGO),
});
export type FormaPago = z.infer<typeof formaPagoSchema>;
export const createFormaPagoSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(80, 'Máximo 80 caracteres')
    .regex(/^[\p{L}][\p{L}\s]*$/u, 'El nombre solo admite letras y espacios'),
  requiereReferencia: z.enum(REQUIERE_REFERENCIA_FORMA_PAGO), estado: z.enum(ESTADOS_FORMA_PAGO),
});
export type CreateFormaPagoInput = z.infer<typeof createFormaPagoSchema>;
export const updateFormaPagoSchema = createFormaPagoSchema.partial();
export type UpdateFormaPagoInput = z.infer<typeof updateFormaPagoSchema>;
