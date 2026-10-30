import type { Request, Response, NextFunction } from 'express';
import * as service from '../../services/credito/mora.service';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(100, Math.max(Number(req.query.limit) || 10, 1));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const result = await service.list({ page, limit, search });
    res.json({ data: result.data, meta: { page, limit, total: result.total, totalPages: Math.max(Math.ceil(result.total / limit), 1) } });
  } catch (error) { next(error); }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.getOne(Number(req.params.id))); } catch (error) { next(error); }
}

export async function recalcular(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.recalcular()); } catch (error) { next(error); }
}

export async function cartera(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.cartera()); } catch (error) { next(error); }
}

export async function resumenCliente(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.resumenCliente(Number(req.params.idCliente))); } catch (error) { next(error); }
}
