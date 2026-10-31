import { Request, Response, NextFunction } from 'express';
import * as clienteService from '../../services/organizacion/cliente.service';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await clienteService.listClientes({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
      search: req.query.search as string | undefined,
      estado: req.query.estado as string | undefined,
    }));
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await clienteService.getCliente(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
}

export async function detalle(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await clienteService.getClienteDetalle(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await clienteService.updateCliente(Number(req.params.id), req.body, req.auth?.sub));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await clienteService.createCliente(req.body, req.auth?.sub));
  } catch (err) {
    next(err);
  }
}
