import { z } from 'zod';

export const documentoCatalogoOptionSchema = z.object({
  id: z.number().int(),
  label: z.string(),
  nit: z.string().nullable().optional(),
  /** Nombre limpio (sin el NIT que lleva `label`), p. ej. para el receptor de una factura. */
  nombre: z.string().optional(),
  saldo: z.number().optional(),
  /** Clientes: su condición de crédito (se propone en documentos nuevos). */
  idCondicion: z.number().int().nullable().optional(),
  /** Condiciones: días de crédito (vencimiento = fecha + días). */
  diasCredito: z.number().int().optional(),
});

export type DocumentoCatalogoOption = z.infer<typeof documentoCatalogoOptionSchema>;
