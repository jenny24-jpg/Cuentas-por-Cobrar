import type { Request, Response } from 'express';
import {
  createNotaCreditoSchema,
  updateNotaCreditoSchema,
} from '@erp/contracts';
import * as service from '../../services/credito/notaCredito.service';

export async function list(req: Request, res: Response) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 10, 1);

    const search =
      typeof req.query.search === 'string'
        ? req.query.search
        : undefined;

    const result = await service.list({
      page,
      limit,
      search,
    });

    const totalPages = Math.max(
      Math.ceil(result.total / limit),
      1,
    );

    return res.json({
      data: result.data,
      meta: {
        page,
        limit,
        total: result.total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error listando notas de crédito:', error);

    return res.status(500).json({
      message: 'No se pudieron obtener las notas de crédito',
    });
  }
}

export async function getOne(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: 'ID de nota de crédito inválido',
      });
    }

    const nota = await service.getOne(id);

    return res.json(nota);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'NOTA_CREDITO_NOT_FOUND'
    ) {
      return res.status(404).json({
        message: 'Nota de crédito no encontrada',
      });
    }

    console.error('Error obteniendo nota de crédito:', error);

    return res.status(500).json({
      message: 'No se pudo obtener la nota de crédito',
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const parsed = createNotaCreditoSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Datos inválidos',
        details: parsed.error.issues.map((issue) => ({
          campo: issue.path.join('.'),
          mensaje: issue.message,
        })),
      });
    }

    const nota = await service.create(parsed.data);

    return res.status(201).json(nota);
  } catch (error) {
    console.error('Error creando nota de crédito:', error);

    return res.status(500).json({
      message: 'No se pudo crear la nota de crédito',
    });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: 'ID de nota de crédito inválido',
      });
    }

    const parsed = updateNotaCreditoSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Datos inválidos',
        details: parsed.error.issues.map((issue) => ({
          campo: issue.path.join('.'),
          mensaje: issue.message,
        })),
      });
    }

    const nota = await service.update(id, parsed.data);

    return res.json(nota);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'NOTA_CREDITO_NOT_FOUND'
    ) {
      return res.status(404).json({
        message: 'Nota de crédito no encontrada',
      });
    }

    console.error('Error actualizando nota de crédito:', error);

    return res.status(500).json({
      message: 'No se pudo actualizar la nota de crédito',
    });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: 'ID de nota de crédito inválido',
      });
    }

    await service.remove(id);

    return res.status(204).send();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'NOTA_CREDITO_NOT_FOUND'
    ) {
      return res.status(404).json({
        message: 'Nota de crédito no encontrada',
      });
    }

    console.error('Error eliminando nota de crédito:', error);

    return res.status(500).json({
      message: 'No se pudo eliminar la nota de crédito',
    });
  }
}