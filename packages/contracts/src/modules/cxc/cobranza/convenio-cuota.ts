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
});

export type ConvenioCuota = z.infer<typeof convenioCuotaSchema>;

// Las cuotas casi siempre se generan automáticamente al crear el convenio
// (numeroCuotas del convenio), pero se deja el input manual disponible para
// ajustes puntuales (agregar/corregir una cuota específica).
export const createConvenioCuotaSchema = z.object({
  idConvenio: z.number().int().positive(),
  numeroCuota: z.number().int().positive(),
  fechaVencimiento: z.string().min(1, 'La fecha de vencimiento es obligatoria'),
  monto: z.number().positive('El monto debe ser mayor a 0'),
  saldo: z.number().nonnegative().optional(), // si no se manda, saldo = monto
  estado: z.enum(ESTADOS_CUOTA).default('PENDIENTE'),
});

export type CreateConvenioCuotaInput = z.infer<typeof createConvenioCuotaSchema>;

export const updateConvenioCuotaSchema = createConvenioCuotaSchema.partial();
export type UpdateConvenioCuotaInput = z.infer<typeof updateConvenioCuotaSchema>;

// Input especial: registrar el pago de una cuota (reduce el saldo, y si
// llega a 0 la marca como PAGADA). Es la operación real que se va a usar
// desde la pantalla de detalle de un convenio.
export const registrarPagoCuotaSchema = z.object({
  montoPagado: z.number().positive('El monto pagado debe ser mayor a 0'),
});
export type RegistrarPagoCuotaInput = z.infer<typeof registrarPagoCuotaSchema>;
