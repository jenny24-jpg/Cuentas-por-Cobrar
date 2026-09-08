import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  createMoraSchema,
  updateMoraSchema,
} from '@erp/contracts';
import * as service from '../../services/credito/mora.service';

export async function list(
  req: Request,
  res: Response,
) {
  try {
    const page = Math.max(
      1,
      Number(req.query.page) || 1,
    );

    const limit = Math.max(
      1,
      Number(req.query.limit) || 10,
    );

    const search =
      typeof req.query.search === 'string'
        ? req.query.search
        : undefined;

    const result = await service.list({
      page,
      limit,
      search,
    });

    return res.json({
      data: result.data,
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.max(
          1,
          Math.ceil(result.total / limit),
        ),
      },
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: 'No se pudieron obtener los registros de mora',
    });
  }
}

export async function getOne(
  req: Request,
  res: Response,
) {
  try {
    const id = Number(req.params.id);

    const mora = await service.getOne(id);

    return res.json(mora);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === 'MORA_NOT_FOUND'
    ) {
      return res.status(404).json({
        message: 'Registro de mora no encontrado',
      });
    }

    console.error(err);

    return res.status(500).json({
      message: 'No se pudo obtener el registro de mora',
    });
  }
}

export async function create(
  req: Request,
  res: Response,
) {
  try {
    const input = createMoraSchema.parse(req.body);

    const mora = await service.create(input);

    return res.status(201).json(mora);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        message: 'Datos inválidos',
        details: err.issues.map((issue) => ({
          campo: issue.path.join('.'),
          mensaje: issue.message,
        })),
      });
    }

    console.error(err);

    return res.status(500).json({
      message: 'No se pudo crear el registro de mora',
    });
  }
}

export async function update(
  req: Request,
  res: Response,
) {
  try {
    const id = Number(req.params.id);

    const input = updateMoraSchema.parse(req.body);

    const mora = await service.update(id, input);

    return res.json(mora);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        message: 'Datos inválidos',
        details: err.issues.map((issue) => ({
          campo: issue.path.join('.'),
          mensaje: issue.message,
        })),
      });
    }

    if (
      err instanceof Error &&
      err.message === 'MORA_NOT_FOUND'
    ) {
      return res.status(404).json({
        message: 'Registro de mora no encontrado',
      });
    }

    console.error(err);

    return res.status(500).json({
      message: 'No se pudo actualizar el registro de mora',
    });
  }
}

export async function remove(
  req: Request,
  res: Response,
) {
  try {
    const id = Number(req.params.id);

    await service.remove(id);

    return res.status(204).send();
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === 'MORA_NOT_FOUND'
    ) {
      return res.status(404).json({
        message: 'Registro de mora no encontrado',
      });
    }

    console.error(err);

    return res.status(500).json({
      message: 'No se pudo eliminar el registro de mora',
    });
  }
}