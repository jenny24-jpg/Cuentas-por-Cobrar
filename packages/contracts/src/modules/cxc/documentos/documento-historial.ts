import { z } from 'zod';

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
  estadoAnterior: z.string().trim().max(30).nullable().optional(),
  estadoNuevo: z.string().trim().min(1, 'El nuevo estado es obligatorio').max(30),
  fecha: z.string().optional(),
  idEmpleado: z.number().int().positive('Selecciona un empleado'),
});

export type CreateDocumentoHistorialInput = z.infer<typeof createDocumentoHistorialSchema>;

export const updateDocumentoHistorialSchema = createDocumentoHistorialSchema
  .omit({ idDocumento: true })
  .partial();

export type UpdateDocumentoHistorialInput = z.infer<typeof updateDocumentoHistorialSchema>;
