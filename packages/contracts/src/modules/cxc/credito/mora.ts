import { z } from 'zod';

export const ESTADOS_MORA = [
  'ACTIVA',
  'PAGADA',
  'ANULADA',
] as const;

export const moraSchema = z.object({
  idMora: z.number().int(),
  idDocumento: z.number().int(),
  diasMora: z.number().int().nullable(),
  saldoVencido: z.number().nullable(),
  porcentajeMora: z.number().nullable(),
  montoMora: z.number().nullable(),
  fechaCalculo: z.string().nullable(),
  estado: z.enum(ESTADOS_MORA),
});

export type Mora = z.infer<typeof moraSchema>;

export const createMoraSchema = z.object({
  idDocumento: z
    .number()
    .int()
    .positive('El documento es obligatorio'),

  diasMora: z
    .number()
    .int()
    .nonnegative('Los días de mora no pueden ser negativos')
    .nullable()
    .optional(),

  saldoVencido: z
    .number()
    .nonnegative('El saldo vencido no puede ser negativo')
    .nullable()
    .optional(),

  porcentajeMora: z
    .number()
    .nonnegative('El porcentaje de mora no puede ser negativo')
    .nullable()
    .optional(),

  montoMora: z
    .number()
    .nonnegative('El monto de mora no puede ser negativo')
    .nullable()
    .optional(),

  fechaCalculo: z
    .string()
    .nullable()
    .optional(),

  estado: z
    .enum(ESTADOS_MORA)
    .default('ACTIVA'),
});

export type CreateMoraInput =
  z.infer<typeof createMoraSchema>;

export const updateMoraSchema =
  createMoraSchema.partial();

export type UpdateMoraInput =
  z.infer<typeof updateMoraSchema>;