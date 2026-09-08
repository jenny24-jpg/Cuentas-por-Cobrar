import { z } from 'zod';

// Tipos de gestión de cobro más comunes en cobranza. No hay CHECK constraint
// en la base de datos para esto (TIPO_GESTION es VARCHAR2 libre), así que la
// validación de valores permitidos vive aquí, en el contrato compartido.
export const TIPOS_GESTION_COBRO = [
  'LLAMADA',
  'VISITA',
  'EMAIL',
  'WHATSAPP',
  'CARTA',
  'OTRO',
] as const;

export const gestionCobroSchema = z.object({
  idGestion: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  idDocumento: z.number().int().nullable(),
  idEmpleado: z.number().int(),
  nombreEmpleado: z.string().nullable().optional(),
  fechaGestion: z.string(), // ISO date
  tipoGestion: z.string().nullable(),
  resultado: z.string().nullable(),
  observacion: z.string().nullable(),
  fechaCompromiso: z.string().nullable(),
  montoCompromiso: z.number().nullable(),
});

export type GestionCobro = z.infer<typeof gestionCobroSchema>;

// Input de creación: solo lo que el usuario puede escribir. idGestion lo
// genera Oracle (IDENTITY), nombreCliente/nombreEmpleado se derivan por JOIN.
export const createGestionCobroSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idDocumento: z.number().int().positive().nullable().optional(),
  idEmpleado: z.number().int().positive('Selecciona un empleado responsable'),
  fechaGestion: z.string().optional(), // si no se manda, el server usa SYSDATE
  tipoGestion: z.enum(TIPOS_GESTION_COBRO).optional(),
  resultado: z.string().max(80).optional(),
  observacion: z.string().max(500).optional(),
  fechaCompromiso: z.string().optional(),
  montoCompromiso: z.number().nonnegative().optional(),
});

export type CreateGestionCobroInput = z.infer<typeof createGestionCobroSchema>;

export const updateGestionCobroSchema = createGestionCobroSchema.partial();
export type UpdateGestionCobroInput = z.infer<typeof updateGestionCobroSchema>;
