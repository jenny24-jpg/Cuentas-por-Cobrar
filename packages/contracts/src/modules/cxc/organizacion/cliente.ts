import { z } from 'zod';

/** CLIENTE es una tabla del ERP; ESTADO es CHAR(1) con CHECK ('A' activo, 'I' inactivo). */
export const ESTADOS_CLIENTE = ['A', 'I'] as const;

/** Cliente con su condición de pago (CLIENTE.ID_CONDICION → CXC_CONDICIONES_CREDITO). */
export const clienteSchema = z.object({
  idCliente: z.number().int(),
  nombre: z.string(),
  nit: z.string().nullable(),
  idCondicion: z.number().int().nullable(),
  diasCredito: z.number().int().nullable(),
  diasGracia: z.number().int().nullable(),
  porcentajeMora: z.number().nullable(),
  estado: z.string().nullable(),
});
export type Cliente = z.infer<typeof clienteSchema>;

/** Resumen de cartera del cliente para la vista de detalle. */
export const clienteResumenSchema = z.object({
  saldoPendiente: z.number(),
  saldoVencido: z.number(),
  documentosAbiertos: z.number().int(),
  documentosVencidos: z.number().int(),
  ultimoPago: z.string().nullable(),
});
export type ClienteResumen = z.infer<typeof clienteResumenSchema>;
export type ClienteDetalle = Cliente & { nitValido: boolean; resumen: ClienteResumen };

/**
 * Nombre o razón social: letras, números y signos habituales en nombres comerciales
 * (punto, coma, &, guion, paréntesis...). Debe contener al menos una letra.
 */
const nombreClienteSchema = z
  .string()
  .trim()
  .min(1, 'El nombre es obligatorio')
  .max(200, 'El nombre no puede superar 200 caracteres')
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}\s.,:'’\-_/#+&()]*$/u, 'El nombre contiene caracteres no permitidos')
  .refine((v) => /\p{L}/u.test(v), 'El nombre debe contener letras');

/**
 * Edición de cliente. La validez del NIT (dígito verificador) la decide el servicio:
 * un NIT que no se modifica se conserva aunque sea un dato heredado inválido.
 */
export const updateClienteSchema = z.object({
  nombre: nombreClienteSchema,
  nit: z.string().trim().toUpperCase().min(1, 'El NIT es obligatorio').max(20, 'El NIT no puede superar 20 caracteres'),
  idCondicion: z.number({ error: 'Selecciona una condición de pago' }).int().positive('Selecciona una condición de pago'),
  estado: z.enum(ESTADOS_CLIENTE, { error: 'El estado debe ser Activo (A) o Inactivo (I)' }),
});
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>;

/** Alta de cliente: mismos campos; el ID lo genera la base (identity) y el estado inicia en 'A'. */
export const createClienteSchema = updateClienteSchema.extend({
  estado: z.enum(ESTADOS_CLIENTE).default('A'),
});
export type CreateClienteInput = z.infer<typeof createClienteSchema>;

/** Texto de la condición de pago: "Contado" o "Crédito 30 días". */
export function describirCondicionPago(diasCredito: number | null | undefined): string {
  if (diasCredito === null || diasCredito === undefined) return 'Sin condición asignada';
  return diasCredito <= 0 ? 'Contado' : `Crédito ${diasCredito} ${diasCredito === 1 ? 'día' : 'días'}`;
}
