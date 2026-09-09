import { z } from 'zod';

// ESTADO_VISITA es VARCHAR2 libre (sin CHECK constraint). Ajustar si tu
// equipo usa otros valores — ver misma nota en RutaDetalleForm.tsx.
export const ESTADOS_VISITA = ['PENDIENTE', 'VISITADO', 'NO_ENCONTRADO', 'REPROGRAMADO'] as const;

export const rutaDetalleSchema = z.object({
  idRutaDetalle: z.number().int(),
  idRuta: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  ordenVisita: z.number().int().nullable(),
  direccion: z.string().nullable(),
  montoPendiente: z.number().nullable(),
  estadoVisita: z.string().nullable(),
  horaVisita: z.string().nullable(),
  observaciones: z.string().nullable(),
});
export type RutaDetalle = z.infer<typeof rutaDetalleSchema>;

// idRuta NO va aquí: se toma del parámetro de la URL (/rutas/:id/detalle),
// igual que las cuotas de un convenio en el módulo de cobranza.
export const createRutaDetalleSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  ordenVisita: z.number().int().positive().optional(),
  direccion: z.string().max(200).optional(),
  montoPendiente: z.number().nonnegative().optional(),
  estadoVisita: z.enum(ESTADOS_VISITA).optional(),
  horaVisita: z.string().max(10).optional(),
  observaciones: z.string().max(500).optional(),
});
export type CreateRutaDetalleInput = z.infer<typeof createRutaDetalleSchema>;

export const updateRutaDetalleSchema = createRutaDetalleSchema.partial();
export type UpdateRutaDetalleInput = z.infer<typeof updateRutaDetalleSchema>;
