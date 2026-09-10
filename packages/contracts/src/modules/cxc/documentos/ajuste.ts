import { z } from 'zod';
import { identifierSchema, isoDateSchema, moneySchema, optionalTrimmedText } from '../validation';

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
  tipoAjuste: identifierSchema('El tipo de ajuste', 30).transform((value) => value.toUpperCase()),
  monto: moneySchema('El monto', true),
  motivo: optionalTrimmedText('El motivo', 250),
  fecha: isoDateSchema('La fecha').optional(),
  idEmpleado: z.number().int().positive('Selecciona un empleado'),
});
export type CreateAjusteInput = z.infer<typeof createAjusteSchema>;

export const updateAjusteSchema = createAjusteSchema.partial();
export type UpdateAjusteInput = z.infer<typeof updateAjusteSchema>;
