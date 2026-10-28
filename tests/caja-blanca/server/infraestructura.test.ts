import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/src/shared/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
import { moneySchema } from '../../../packages/contracts/src/modules/cxc/validation';
import type { NextFunction, Request, Response, Router } from 'express';
import { businessNowHHMM, businessTodayIso } from '../../../server/src/shared/date';
import { validarIdsDeRuta } from '../../../server/src/shared/idParams';
import { errorHandler } from '../../../server/src/middlewares/errorHandler';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  SatRechazoError,
  TooManyRequestsError,
} from '../../../server/src/shared/errors/AppError';

describe('fechas de negocio (huso Guatemala)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a las 23:30 de Guatemala sigue siendo el mismo día aunque en UTC ya sea mañana', () => {
    vi.setSystemTime(new Date('2026-10-28T05:30:00Z'));
    expect(businessTodayIso()).toBe('2026-10-27');
    expect(businessNowHHMM()).toBe('23:30');
  });
  it('respeta un huso explícito', () => {
    vi.setSystemTime(new Date('2026-10-28T05:30:00Z'));
    expect(businessTodayIso('UTC')).toBe('2026-10-28');
    expect(businessNowHHMM('UTC')).toBe('05:30');
  });
});

describe('validarIdsDeRuta', () => {
  type Handler = (req: Request, res: Response, next: NextFunction, valor: string) => void;
  const handlers = new Map<string, Handler>();
  const router = { param: (nombre: string, h: Handler) => handlers.set(nombre, h) } as unknown as Router;
  validarIdsDeRuta(router);
  const probar = (valor: string) => {
    let recibido: unknown = 'sin-llamar';
    handlers.get('id')!({} as Request, {} as Response, ((e?: unknown) => { recibido = e; }) as NextFunction, valor);
    return recibido;
  };

  it('registra todos los parámetros de id', () => {
    expect([...handlers.keys()]).toEqual(['id', 'idCliente', 'idCuota', 'idDetalle', 'idEmpleado', 'idHistorial']);
  });
  it.each(['1', '42', '9999999999'])('acepta %s', (v) => expect(probar(v)).toBeUndefined());
  it.each(['0', '-5', 'abc', '1.5', '1e3', '01', '12345678901', ''])('rechaza %s con 400', (v) => {
    expect(probar(v)).toBeInstanceOf(BadRequestError);
  });
});

describe('errorHandler', () => {
  const ejecutar = (err: unknown) => {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      headers: {} as Record<string, string>,
      status(code: number) { this.statusCode = code; return this; },
      json(b: unknown) { this.body = b; return this; },
      setHeader(k: string, v: string) { this.headers[k] = v; },
    };
    errorHandler(err, { method: 'GET', originalUrl: '/x' } as Request, res as unknown as Response, vi.fn());
    return res;
  };

  it('ZodError → 400 con detalle por campo', () => {
    const r = moneySchema('El monto').safeParse('x');
    const res = ejecutar(r.error);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'Datos inválidos', details: [{ campo: '' }] });
  });
  it('AppError expuesto conserva mensaje y código', () => {
    const res = ejecutar(new ConflictError('Ya reversada'));
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Ya reversada', code: 'CONFLICT' });
  });
  it('AppError no expuesto oculta el mensaje interno', () => {
    const res = ejecutar(new AppError('ORA-00001 secreto', 500, 'DB', false));
    expect(res.body).toEqual({ error: 'No fue posible completar la operación', code: 'DB' });
  });
  it('incluye details cuando el error los trae (rechazo SAT)', () => {
    const res = ejecutar(new SatRechazoError([{ codigo: 'X', campo: 'nit', mensaje: 'NIT malo' }]));
    expect(res.body).toMatchObject({ code: 'SAT_RECHAZO', details: [{ campo: 'nit', mensaje: '[X] NIT malo' }] });
  });
  it('429 agrega cabecera Retry-After', () => {
    const res = ejecutar(new TooManyRequestsError('Espera', 30));
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('30');
    expect(res.body).toMatchObject({ retryAfter: 30 });
  });
  it('NotFoundError local (por nombre) → 404', () => {
    const e = new Error('No existe');
    e.name = 'NotFoundError';
    expect(ejecutar(e).statusCode).toBe(404);
    expect(ejecutar(new NotFoundError('x')).statusCode).toBe(404);
  });
  it('error desconocido → 500 genérico, sin filtrar el mensaje', () => {
    const res = ejecutar(new Error('ORA-12541: TNS no listener'));
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('ORA-');
    expect(ejecutar('texto').statusCode).toBe(500);
  });
});
