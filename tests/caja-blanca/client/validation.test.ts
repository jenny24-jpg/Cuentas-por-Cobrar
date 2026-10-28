import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasErrors,
  parseDateOnly,
  sanitizeSoloLetras,
  todayIso,
  validateAlphanumericCode,
  validateDate,
  validateGuatemalaNit,
  validateIdentifier,
  validateLettersOnly,
  validateMaxLength,
  validateMoney,
  validateNumber,
  validatePercentage,
  validateRequired,
  validateRequiredDate,
  validateRequiredNumber,
  validateRequiredSelect,
  validateSoloLetras,
  validateTextOnly,
} from '../../../client/src/shared/validation';

describe('obligatorios', () => {
  it('validateRequired / validateRequiredSelect', () => {
    for (const vacio of [undefined, null, '', '   ']) {
      expect(validateRequired(vacio, 'El nombre')).toBe('El nombre es obligatorio.');
      expect(validateRequiredSelect(vacio, 'un cliente')).toBe('Debes seleccionar un cliente.');
    }
    expect(validateRequired('x', 'El nombre')).toBeUndefined();
    expect(validateRequiredSelect('1', 'un cliente')).toBeUndefined();
  });
});

describe('validateNumber — cada rama', () => {
  it('vacío no es error (lo controla el obligatorio)', () => expect(validateNumber('', 'X')).toBeUndefined());
  it.each(['abc', '1e3', '1,5', '1.', '.5', '+1', '--1'])('formato inválido %s', (v) => {
    expect(validateNumber(v, 'X')).toMatch(/número válido, sin letras/);
  });
  it('entero', () => {
    expect(validateNumber('1.5', 'X', { integer: true })).toMatch(/entero/);
    expect(validateNumber('2', 'X', { integer: true })).toBeUndefined();
  });
  it('decimales permitidos', () => {
    expect(validateNumber('1.234', 'X', { decimalPlaces: 2 })).toMatch(/como máximo 2 decimales/);
    expect(validateNumber('1.23', 'X', { decimalPlaces: 2 })).toBeUndefined();
    expect(validateNumber('5', 'X', { decimalPlaces: 2 })).toBeUndefined();
  });
  it('positivo, mínimo y máximo', () => {
    expect(validateNumber('0', 'X', { positive: true })).toMatch(/mayor a 0/);
    expect(validateNumber('-1', 'X', { min: 0 })).toMatch(/mayor o igual a 0/);
    expect(validateNumber('101', 'X', { max: 100 })).toMatch(/menor o igual a 100/);
    expect(validateNumber(' 50 ', 'X', { min: 0, max: 100, positive: true })).toBeUndefined();
  });
  it('número enorme que no es finito', () => {
    expect(validateNumber('9'.repeat(400), 'X')).toMatch(/número válido\.$/);
  });
});

describe('validateRequiredNumber / validateMoney / validatePercentage', () => {
  it('obligatorio antes que formato', () => {
    expect(validateRequiredNumber('', 'X')).toMatch(/obligatorio/);
    expect(validateRequiredNumber('a', 'X')).toMatch(/número válido/);
    expect(validateRequiredNumber('3', 'X')).toBeUndefined();
  });
  it('dinero: obligatorio opcional y 2 decimales', () => {
    expect(validateMoney('', 'El monto', { required: true })).toMatch(/obligatorio/);
    expect(validateMoney('', 'El monto')).toBeUndefined();
    expect(validateMoney('10.999', 'El monto')).toMatch(/2 decimales/);
    expect(validateMoney('0', 'El monto', { positive: true })).toMatch(/mayor a 0/);
    expect(validateMoney('10.50', 'El monto', { required: true, positive: true })).toBeUndefined();
  });
  it('porcentaje: 0 a 100 y 4 decimales por defecto', () => {
    expect(validatePercentage('', 'La tasa', { required: true })).toMatch(/obligatorio/);
    expect(validatePercentage('100.5', 'La tasa')).toMatch(/menor o igual a 100/);
    expect(validatePercentage('1.12345', 'La tasa')).toMatch(/4 decimales/);
    expect(validatePercentage('1.123', 'La tasa', { decimalPlaces: 2 })).toMatch(/2 decimales/);
    expect(validatePercentage('0', 'La tasa', { positive: true })).toMatch(/mayor a 0/);
    expect(validatePercentage('12.5', 'La tasa')).toBeUndefined();
  });
});

describe('fechas', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, 12, 0, 0)); // hora local del navegador
  });
  afterEach(() => vi.useRealTimers());

  it('parseDateOnly', () => {
    expect(parseDateOnly('')).toBeNull();
    expect(parseDateOnly('2026/10/27')).toBeNull();
    expect(parseDateOnly('2026-02-30')).toBeNull();
    expect(parseDateOnly('2026-10-27')?.toISOString()).toBe('2026-10-27T00:00:00.000Z');
  });
  it('todayIso usa la fecha local', () => expect(todayIso()).toBe('2026-10-27'));
  it('validateDate — cada regla', () => {
    expect(validateDate('', 'F')).toBeUndefined();
    expect(validateDate('x', 'F')).toMatch(/no es una fecha válida/);
    expect(validateDate('1899-12-31', 'F')).toMatch(/anterior a 1900-01-01/);
    expect(validateDate('2101-01-01', 'F')).toMatch(/posterior a 2100-12-31/);
    expect(validateDate('2026-01-01', 'F', { minDate: '2026-02-01' })).toMatch(/anterior a 2026-02-01/);
    expect(validateDate('2026-03-01', 'F', { maxDate: '2026-02-01' })).toMatch(/posterior a 2026-02-01/);
    expect(validateDate('2026-10-28', 'F', { notFuture: true })).toMatch(/futura/);
    expect(validateDate('2026-10-27', 'F', { notFuture: true, notPast: true })).toBeUndefined();
    expect(validateDate('2026-10-26', 'F', { notPast: true })).toMatch(/anterior a hoy/);
    expect(validateDate('2026-10-01', 'F', { notBefore: { date: '2026-10-02', label: 'la emisión' } })).toMatch(/anterior a la emisión/);
    expect(validateDate('2026-10-03', 'F', { notAfter: { date: '2026-10-02', label: 'el vencimiento' } })).toMatch(/posterior a el vencimiento/);
    expect(validateDate('2026-10-02', 'F', { notBefore: { date: '', label: 'x' }, notAfter: { date: 'mal', label: 'y' } })).toBeUndefined();
  });
  it('validateRequiredDate', () => {
    expect(validateRequiredDate('', 'F')).toMatch(/obligatorio/);
    expect(validateRequiredDate('2026-10-27', 'F')).toBeUndefined();
  });
});

describe('textos', () => {
  it('validateMaxLength', () => {
    expect(validateMaxLength(null, 'X', 3)).toBeUndefined();
    expect(validateMaxLength('abcd', 'X', 3)).toMatch(/superar los 3/);
    expect(validateMaxLength('abc', 'X', 3)).toBeUndefined();
  });
  it('validateLettersOnly admite apóstrofos, puntos y guiones de nombres', () => {
    expect(validateLettersOnly("O'Neil-Peña Jr.", 'X')).toBeUndefined();
    expect(validateLettersOnly('Ana2', 'X')).toMatch(/solo admite letras/);
    expect(validateLettersOnly('', 'X')).toBeUndefined();
  });
  it('validateSoloLetras / sanitizeSoloLetras', () => {
    expect(validateSoloLetras('José', 'X')).toBeUndefined();
    expect(validateSoloLetras('José.', 'X')).toMatch(/sin números ni signos/);
    expect(validateSoloLetras(undefined, 'X')).toBeUndefined();
    expect(sanitizeSoloLetras('Ru-ta 1 ñ!')).toBe('Ruta  ñ');
  });
  it('validateTextOnly — requerido, caracteres, mínimo y máximo', () => {
    expect(validateTextOnly('', 'Obs', { required: true })).toMatch(/obligatorio/);
    expect(validateTextOnly('', 'Obs')).toBeUndefined();
    expect(validateTextOnly('Pago 1', 'Obs')).toMatch(/solo admite letras/);
    expect(validateTextOnly('ab', 'Obs', { minLength: 3 })).toMatch(/al menos 3/);
    expect(validateTextOnly('abcd', 'Obs', { maxLength: 3 })).toMatch(/superar los 3/);
    expect(validateTextOnly('  abc  ', 'Obs', { minLength: 3, maxLength: 3 })).toBeUndefined();
  });
  it('validateAlphanumericCode', () => {
    expect(validateAlphanumericCode('Av. 5 #3-45 (zona 1)', 'X')).toBeUndefined();
    expect(validateAlphanumericCode('-inicio', 'X')).toMatch(/no permitidos/);
    expect(validateAlphanumericCode('a$b', 'X')).toMatch(/no permitidos/);
    expect(validateAlphanumericCode('', 'X')).toBeUndefined();
  });
  it('validateIdentifier', () => {
    expect(validateIdentifier('FAC-001/A', 'X')).toBeUndefined();
    expect(validateIdentifier('FA C', 'X')).toMatch(/solo admite/);
    expect(validateIdentifier('000', 'X')).toMatch(/solo por ceros/);
    expect(validateIdentifier(null, 'X')).toBeUndefined();
  });
});

describe('validateGuatemalaNit', () => {
  it('vacío y CF son válidos', () => {
    expect(validateGuatemalaNit('')).toBeUndefined();
    expect(validateGuatemalaNit(' cf ')).toBeUndefined();
  });
  it('formato inválido vs dígito verificador inválido', () => {
    expect(validateGuatemalaNit('12-AB')).toMatch(/formato válido/);
    expect(validateGuatemalaNit('1234567-8', 'El NIT')).toMatch(/El NIT no es válido/);
    expect(validateGuatemalaNit('1234567-9')).toBeUndefined();
    expect(validateGuatemalaNit('12345679')).toBeUndefined();
  });
});

describe('hasErrors', () => {
  it('solo cuenta mensajes no vacíos', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ a: '' })).toBe(false);
    expect(hasErrors({ a: '', b: 'Error' })).toBe(true);
  });
});
