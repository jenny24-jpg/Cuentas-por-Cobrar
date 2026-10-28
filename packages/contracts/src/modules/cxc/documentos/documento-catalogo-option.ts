import { z } from 'zod';

export const documentoCatalogoOptionSchema = z.object({
  id: z.number().int(),
  label: z.string(),
  nit: z.string().nullable().optional(),
  /** Nombre limpio (sin el NIT que lleva `label`), p. ej. para el receptor de una factura. */
  nombre: z.string().optional(),
  saldo: z.number().optional(),
});

export type DocumentoCatalogoOption = z.infer<typeof documentoCatalogoOptionSchema>;
