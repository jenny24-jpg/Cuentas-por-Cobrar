import { z } from 'zod';
import { isoDateSchema } from '../validation';
import { ESTADOS_DOCUMENTO } from './documento';

export const documentoHistorialSchema = z.object({
  idHistorial: z.number().int(),
  idDocumento: z.number().int(),
  estadoAnterior: z.string().nullable(),
  estadoNuevo: z.string(),
  fecha: z.string(),
  idEmpleado: z.number().int(),
  nombreEmpleado: z.string().nullable().optional(),
});
export type DocumentoHistorial = z.infer<typeof documentoHistorialSchema>;

export const createDocumentoHistorialSchema = z.object({
  idDocumento: z.number().int().positive(),
  estadoAnterior: z.enum(ESTADOS_DOCUMENTO).nullable().optional(),
  estadoNuevo: z.enum(ESTADOS_DOCUMENTO, { message: 'Selecciona un estado válido' }),
  fecha: isoDateSchema('La fecha').optional(),
  idEmpleado: z.number().int().positive('Selecciona un empleado'),
});
export type CreateDocumentoHistorialInput = z.infer<typeof createDocumentoHistorialSchema>;

export const updateDocumentoHistorialSchema = createDocumentoHistorialSchema
  .omit({ idDocumento: true })
  .partial();
export type UpdateDocumentoHistorialInput = z.infer<typeof updateDocumentoHistorialSchema>;
