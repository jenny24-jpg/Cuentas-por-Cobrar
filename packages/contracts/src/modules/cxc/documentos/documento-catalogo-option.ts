import { z } from 'zod';

export const documentoCatalogoOptionSchema = z.object({
  id: z.number().int(),
  label: z.string(),
});

export type DocumentoCatalogoOption = z.infer<typeof documentoCatalogoOptionSchema>;
