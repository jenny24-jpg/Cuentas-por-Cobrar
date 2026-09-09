import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  createAplicacionNotaCreditoSchema,
  updateAplicacionNotaCreditoSchema,
} from '@erp/contracts';
import * as service from '../../services/credito/aplicacionNotaCredito.service';

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
      message:
        'No se pudieron obtener las aplicaciones de notas de crédito',
    });
  }
}

export async function getOne(
  req: Request,
  res: Response,
) {
  try {
    const id = Number(req.params.id);

    const aplicacion = await service.getOne(id);

    return res.json(aplicacion);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message ===
        'APLICACION_NOTA_CREDITO_NOT_FOUND'
    ) {
      return res.status(404).json({
        message:
          'Aplicación de nota de crédito no encontrada',
      });
    }

    console.error(err);

    return res.status(500).json({
      message:
        'No se pudo obtener la aplicación de nota de crédito',
    });
  }
}

export async function create(
  req: Request,
  res: Response,
) {
  try {
    const input =
      createAplicacionNotaCreditoSchema.parse(
        req.body,
      );

    const aplicacion =
      await service.create(input);

    return res.status(201).json(aplicacion);
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
      message:
        'No se pudo crear la aplicación de nota de crédito',
    });
  }
}

export async function update(
  req: Request,
  res: Response,
) {
  try {
    const id = Number(req.params.id);

    const input =
      updateAplicacionNotaCreditoSchema.parse(
        req.body,
      );

    const aplicacion =
      await service.update(id, input);

    return res.json(aplicacion);
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
      err.message ===
        'APLICACION_NOTA_CREDITO_NOT_FOUND'
    ) {
      return res.status(404).json({
        message:
          'Aplicación de nota de crédito no encontrada',
      });
    }

    console.error(err);

    return res.status(500).json({
      message:
        'No se pudo actualizar la aplicación de nota de crédito',
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
      err.message ===
        'APLICACION_NOTA_CREDITO_NOT_FOUND'
    ) {
      return res.status(404).json({
        message:
          'Aplicación de nota de crédito no encontrada',
      });
    }

    console.error(err);

    return res.status(500).json({
      message:
        'No se pudo eliminar la aplicación de nota de crédito',
    });
  }
}