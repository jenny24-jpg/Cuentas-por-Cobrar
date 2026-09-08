import { z } from 'zod';

export const ESTADOS_CUOTA = ['PENDIENTE', 'PAGADA', 'VENCIDA'] as const;

export const convenioCuotaSchema = z.object({
  idCuota: z.number().int(),
  idConvenio: z.number().int(),
  numeroCuota: z.number().int(),
  fechaVencimiento: z.string(),
  monto: z.number(),
  saldo: z.number(),
  estado: z.enum(ESTADOS_CUOTA),
  idFormaPago: z.number().int().nullable(),
  nombreFormaPago: z.string().nullable().optional(),
  referenciaPago: z.string().nullable(),
});

export type ConvenioCuota = z.infer<typeof convenioCuotaSchema>;

export const createConvenioCuotaSchema = z.object({
  idConvenio: z.number().int().positive(),
  numeroCuota: z.number().int().positive(),
  fechaVencimiento: z.string().min(1, 'La fecha de vencimiento es obligatoria'),
  monto: z.number().positive('El monto debe ser mayor a 0'),
  saldo: z.number().nonnegative().optional(),
  estado: z.enum(ESTADOS_CUOTA).default('PENDIENTE'),
});

export type CreateConvenioCuotaInput = z.infer<typeof createConvenioCuotaSchema>;

export const updateConvenioCuotaSchema = createConvenioCuotaSchema.partial();
export type UpdateConvenioCuotaInput = z.infer<typeof updateConvenioCuotaSchema>;

/**
 * Registrar un pago de cuota ahora exige forma de pago (catálogo compartido
 * CXC_FORMAS_PAGO). La referencia (número de cheque, de transferencia, etc.)
 * es obligatoria solo si esa forma de pago la requiere — eso se valida en
 * el frontend, donde ya se conoce el catálogo con el flag
 * REQUIERE_REFERENCIA; aquí en el backend queda como opcional para no
 * duplicar esa regla de forma frágil.
 */
export const registrarPagoCuotaSchema = z.object({
  montoPagado: z.number().positive('El monto pagado debe ser mayor a 0'),
  idFormaPago: z.number().int().positive('Selecciona una forma de pago'),
  referenciaPago: z.string().max(50, 'La referencia no puede superar los 50 caracteres').optional(),
});
export type RegistrarPagoCuotaInput = z.infer<typeof registrarPagoCuotaSchema>;