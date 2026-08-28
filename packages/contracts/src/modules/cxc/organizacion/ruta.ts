import { z } from 'zod';

// ESTADO es VARCHAR2 libre en Oracle (sin CHECK constraint). Estos son los
// valores que usamos por convención en el sistema. Si tu equipo definió
// otros, ajusta esta lista Y la copia en RutaForm.tsx (ver nota ahí).
export const ESTADOS_RUTA = ['PLANIFICADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'] as const;

export const rutaSchema = z.object({
  idRuta: z.number().int(),
  codigoRuta: z.string().nullable(),
  nombre: z.string(),
  idEmpleado: z.number().int(),
  nombreEmpleado: z.string().nullable().optional(),
  fecha: z.string().nullable(),
  estado: z.string(),
  observaciones: z.string(),
});
export type Ruta = z.infer<typeof rutaSchema>;

export const createRutaSchema = z.object({
  codigoRuta: z.string().max(20).optional(),
  nombre: z.string().min(1, 'El nombre es obligatorio').max(150),
  idEmpleado: z.number().int().positive('Selecciona un empleado responsable'),
  fecha: z.string().optional(),
  estado: z.enum(ESTADOS_RUTA).default('PLANIFICADA'),
  // OBSERVACIONES es NOT NULL en Oracle; el repository manda '' si no se
  // envía nada, así que aquí se mantiene opcional para no forzar al usuario.
  observaciones: z.string().max(500).optional(),
});
export type CreateRutaInput = z.infer<typeof createRutaSchema>;

export const updateRutaSchema = createRutaSchema.partial();
export type UpdateRutaInput = z.infer<typeof updateRutaSchema>;
