import { z } from 'zod';
import { isoDateSchema, moneySchema } from '../validation';

export const TIPOS_AJUSTE = ['DEBITO', 'CREDITO'] as const;

export const ajusteSchema = z.object({
  idAjuste: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  idDocumento: z.number().int().nullable(),
  tipoAjuste: z.string(),
  monto: z.number(),
  motivo: z.string().nullable(),
  fecha: z.string(),
  idEmpleado: z.number().int(),
  nombreEmpleado: z.string().nullable().optional(),
});
export type Ajuste = z.infer<typeof ajusteSchema>;

export const createAjusteSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idDocumento: z.number().int().positive().nullable().optional(),
  tipoAjuste: z.enum(TIPOS_AJUSTE, { message: 'Selecciona Débito o Crédito' }),
  monto: moneySchema('El monto', true),
  motivo: z.string().trim().min(10, 'Describe el motivo del ajuste (mínimo 10 caracteres)').max(250, 'El motivo no puede superar 250 caracteres'),
  fecha: isoDateSchema('La fecha').optional(),
  idEmpleado: z.number().int().positive('Selecciona un empleado'),
});
export type CreateAjusteInput = z.infer<typeof createAjusteSchema>;

export const updateAjusteSchema = createAjusteSchema.partial();
export type UpdateAjusteInput = z.infer<typeof updateAjusteSchema>;
