import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { TipoSolicitudReversa } from '@erp/contracts';
import * as service from '../../services/autorizaciones/solicitudReversa.service';
import { empleadoDelUsuario } from '../../../auth/empleadoActual';
import { UnauthorizedError } from '../../../../shared/errors/AppError';

function usuarioActual(req: Request): service.UsuarioActual {
  if (!req.auth?.sub) throw new UnauthorizedError('Inicia sesión para continuar.');
  return { idUsuario: Number(req.auth.sub), rol: req.auth.rol };
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.list(req.query as Record<string, string>)); } catch (e) { next(e); }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.getOne(Number(req.params.id))); } catch (e) { next(e); }
}

export async function pendientes(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.pendientes(req.query.tipo)); } catch (e) { next(e); }
}

export async function contar(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.contarPendientes()); } catch (e) { next(e); }
}

export async function crear(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(202).json(await service.solicitar(req.body, usuarioActual(req), await empleadoDelUsuario(req)));
  } catch (e) { next(e); }
}

export async function aprobar(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.aprobar(Number(req.params.id), usuarioActual(req))); } catch (e) { next(e); }
}

export async function rechazar(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.rechazar(Number(req.params.id), req.body, usuarioActual(req))); } catch (e) { next(e); }
}

export async function cancelar(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.cancelar(Number(req.params.id), usuarioActual(req))); } catch (e) { next(e); }
}

/**
 * Los botones Reversar/Anular de cada pantalla siguen usando su endpoint de siempre;
 * ahora ese endpoint registra la solicitud (202) en lugar de ejecutar la operación.
 */
export function solicitarDesde(tipo: TipoSolicitudReversa, campoMotivo: string): RequestHandler {
  return async (req, res, next) => {
    try {
      const solicitud = await service.solicitar(
        { tipo, idRegistro: Number(req.params.id), motivo: req.body?.[campoMotivo] ?? req.body?.motivo },
        usuarioActual(req),
        await empleadoDelUsuario(req),
      );
      res.status(202).json(solicitud);
    } catch (e) { next(e); }
  };
}
