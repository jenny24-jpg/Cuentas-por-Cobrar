import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Manejador de errores centralizado. Los controladores deben usar
 * try/catch y llamar a next(err) — nunca res.status(500) manualmente,
 * para que todos los módulos (compras, bancos, cxp, cxc) respondan errores
 * con el mismo formato.
 */
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Errores de validación de entrada (esquemas de @erp/contracts)
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Datos inválidos',
      details: err.issues.map((issue) => ({
        campo: issue.path.join('.'),
        mensaje: issue.message,
      })),
    });
    return;
  }

  // Recurso no encontrado (services de cada módulo lanzan NotFoundError)
  if (err?.name === 'NotFoundError') {
    res.status(404).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: 'Error interno del servidor'
  });
}
