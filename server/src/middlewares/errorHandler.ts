import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, TooManyRequestsError } from '../shared/errors/AppError';

/** ORA-02292: se intentó borrar un registro que otros registros todavía usan. */
const ORA_HIJOS_EXISTENTES = 2292;
import { logger } from '../shared/logger';

/**
 * Punto único para transformar errores de dominio/validación en HTTP.
 * Nunca devuelve stack traces, SQL, credenciales ni mensajes internos al
 * navegador. El detalle técnico se conserva solo en el log del servidor.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
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

  if (err instanceof AppError) {
    if (err instanceof TooManyRequestsError) res.setHeader('Retry-After', String(err.retryAfterSeconds));
    res.status(err.statusCode).json({
      error: err.expose ? err.message : 'No fue posible completar la operación',
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
      ...(err instanceof TooManyRequestsError ? { retryAfter: err.retryAfterSeconds } : {}),
    });
    return;
  }

  // Compatibilidad con módulos que todavía lancen su NotFoundError local.
  if (err instanceof Error && err.name === 'NotFoundError') {
    res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
    return;
  }

  if (err instanceof Error && (err as { errorNum?: number }).errorNum === ORA_HIJOS_EXISTENTES) {
    logger.warn('delete_con_registros_relacionados', { method: req.method, path: req.originalUrl, error: err.message });
    res.status(409).json({
      error: 'No se puede eliminar porque otros registros dependen de él. Elimina o anula primero los registros relacionados.',
      code: 'HAS_RELATED_RECORDS',
    });
    return;
  }

  logger.error('unhandled_error', {
    method: req.method,
    path: req.originalUrl,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  res.status(500).json({
    error: 'Error interno del servidor',
    code: 'INTERNAL_ERROR',
  });
}
