import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EPSILON,
  deriveDocumentoCondicion,
  deriveDocumentoEstado,
  hasFinancialMovement,
  isDocumentoBloqueadoParaAplicacion,
  roundMoney,
} from '../../../server/src/modules/cxc/shared/financialRules';

describe('roundMoney', () => {
  it('redondea a 2 decimales con el caso clásico de coma flotante', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(10)).toBe(10);
  });
  it('convierte cadenas numéricas (columnas NUMBER que llegan como string)', () => {
    expect(roundMoney('12.345' as unknown as number)).toBe(12.35);
  });
});

describe('deriveDocumentoEstado', () => {
  it('rama ANULADO: respeta el estado anulado aunque el saldo sea total', () => {
    expect(deriveDocumentoEstado(100, 100, 'ANULADO')).toBe('ANULADO');
    expect(deriveDocumentoEstado(100, 0, ' anulada ')).toBe('ANULADO');
  });
  it('rama PAGADO: saldo en cero o dentro de la tolerancia', () => {
    expect(deriveDocumentoEstado(100, 0)).toBe('PAGADO');
    expect(deriveDocumentoEstado(100, 0.004)).toBe('PAGADO');
  });
  it('rama PENDIENTE: saldo igual o mayor al total', () => {
    expect(deriveDocumentoEstado(100, 100)).toBe('PENDIENTE');
    expect(deriveDocumentoEstado(100, 120)).toBe('PENDIENTE');
  });
  it('rama PARCIAL: saldo entre cero y el total', () => {
    expect(deriveDocumentoEstado(100, 40, 'PENDIENTE')).toBe('PARCIAL');
  });
  it('normaliza totales y saldos negativos a cero', () => {
    expect(deriveDocumentoEstado(-5, -5)).toBe('PAGADO');
  });
  it('estado nulo o vacío no se trata como anulado', () => {
    expect(deriveDocumentoEstado(100, 100, null)).toBe('PENDIENTE');
  });
});

describe('deriveDocumentoCondicion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T18:00:00Z')); // mediodía en Guatemala
  });
  afterEach(() => vi.useRealTimers());

  it('documento anulado o saldado siempre es VIGENTE', () => {
    expect(deriveDocumentoCondicion('2020-01-01', 100, 'ANULADO')).toBe('VIGENTE');
    expect(deriveDocumentoCondicion('2020-01-01', 0)).toBe('VIGENTE');
  });
  it('sin fecha de vencimiento es VIGENTE', () => {
    expect(deriveDocumentoCondicion(null, 100)).toBe('VIGENTE');
    expect(deriveDocumentoCondicion(undefined, 100)).toBe('VIGENTE');
  });
  it('vence ayer: VENCIDA; vence hoy o después: VIGENTE (texto)', () => {
    expect(deriveDocumentoCondicion('2026-10-26', 50)).toBe('VENCIDA');
    expect(deriveDocumentoCondicion('2026-10-27', 50)).toBe('VIGENTE');
    expect(deriveDocumentoCondicion('2026-10-28T00:00:00', 50)).toBe('VIGENTE');
  });
  it('acepta objetos Date', () => {
    expect(deriveDocumentoCondicion(new Date('2026-10-01T06:00:00Z'), 50)).toBe('VENCIDA');
  });
});

describe('isDocumentoBloqueadoParaAplicacion', () => {
  it.each(['PAGADO', 'pagada', ' ANULADO ', 'ANULADA'])('bloquea %s', (estado) => {
    expect(isDocumentoBloqueadoParaAplicacion(estado)).toBe(true);
  });
  it.each(['PENDIENTE', 'PARCIAL', 'VENCIDO', null, undefined])('permite %s', (estado) => {
    expect(isDocumentoBloqueadoParaAplicacion(estado)).toBe(false);
  });
});

describe('hasFinancialMovement', () => {
  it('detecta movimiento solo por encima de la tolerancia', () => {
    expect(hasFinancialMovement(100, 100)).toBe(false);
    expect(hasFinancialMovement(100, 100 - EPSILON / 2)).toBe(false);
    expect(hasFinancialMovement(100, 99.99)).toBe(true);
  });
});
