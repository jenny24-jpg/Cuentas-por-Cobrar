import { describe, expect, it } from 'vitest';
import {
  hasAtMostDecimals,
  identifierSchema,
  isIsoDate,
  isoDateSchema,
  moneySchema,
  nitSchema,
  nullableIsoDateSchema,
  optionalIdentifierSchema,
  optionalIsoDateSchema,
  optionalMoneySchema,
  optionalTrimmedText,
  percentageSchema,
  soloLetrasSchema,
  timeSchema,
} from '../../../packages/contracts/src/modules/cxc/validation';

const mensaje = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => r.error?.issues[0]?.message;

describe('isIsoDate', () => {
  it('acepta fechas reales dentro del rango de negocio', () => {
    expect(isIsoDate('2026-10-27')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true); // bisiesto
    expect(isIsoDate('1900-01-01')).toBe(true);
    expect(isIsoDate('2100-12-31')).toBe(true);
  });
  it('rechaza formato incorrecto, fuera de rango y fechas inexistentes', () => {
    expect(isIsoDate('27/10/2026')).toBe(false);
    expect(isIsoDate('1899-12-31')).toBe(false);
    expect(isIsoDate('2101-01-01')).toBe(false);
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
  });
});

describe('esquemas de fecha', () => {
  it('isoDateSchema: obligatoria y válida', () => {
    expect(mensaje(isoDateSchema('La fecha').safeParse(''))).toBe('La fecha es obligatoria');
    expect(isoDateSchema('La fecha').safeParse('2026-02-30').success).toBe(false);
    expect(isoDateSchema('La fecha').safeParse('2026-02-28').success).toBe(true);
  });
  it('optionalIsoDateSchema: admite vacío y undefined', () => {
    const s = optionalIsoDateSchema('La fecha');
    expect(s.safeParse('').success).toBe(true);
    expect(s.safeParse(undefined).success).toBe(true);
    expect(s.safeParse('x').success).toBe(false);
  });
  it('nullableIsoDateSchema: admite null', () => {
    const s = nullableIsoDateSchema('La fecha');
    expect(s.safeParse(null).success).toBe(true);
    expect(s.safeParse('2026-01-01').success).toBe(true);
    expect(s.safeParse('2026-1-1').success).toBe(false);
  });
});

describe('hasAtMostDecimals', () => {
  it('cuenta decimales con tolerancia de coma flotante', () => {
    expect(hasAtMostDecimals(10.25, 2)).toBe(true);
    expect(hasAtMostDecimals(0.1 + 0.2, 2)).toBe(true); // 0.30000000000000004 se acepta como 0.30
    expect(hasAtMostDecimals(10.255, 2)).toBe(false);
    expect(hasAtMostDecimals(Number.NaN, 2)).toBe(false);
    expect(hasAtMostDecimals(Infinity, 2)).toBe(false);
  });
});

describe('moneySchema', () => {
  it('positivo: rechaza 0 y negativos', () => {
    const s = moneySchema('El monto', true);
    expect(mensaje(s.safeParse(0))).toBe('El monto debe ser mayor a 0');
    expect(s.safeParse(-1).success).toBe(false);
    expect(s.safeParse(0.01).success).toBe(true);
  });
  it('no negativo: admite 0 y rechaza negativos', () => {
    const s = moneySchema('El saldo');
    expect(s.safeParse(0).success).toBe(true);
    expect(mensaje(s.safeParse(-0.01))).toBe('El saldo no puede ser negativo');
  });
  it('rechaza más de 2 decimales, infinitos y texto', () => {
    const s = moneySchema('El monto', true);
    expect(mensaje(s.safeParse(1.234))).toBe('El monto admite como máximo 2 decimales');
    expect(s.safeParse(Infinity).success).toBe(false);
    expect(s.safeParse('10').success).toBe(false);
  });
  it('optionalMoneySchema admite null y undefined', () => {
    const s = optionalMoneySchema('El monto');
    expect(s.safeParse(null).success).toBe(true);
    expect(s.safeParse(undefined).success).toBe(true);
  });
});

describe('percentageSchema', () => {
  it('rango 0–100 y decimales configurables', () => {
    const s = percentageSchema('La tasa');
    expect(s.safeParse(0).success).toBe(true);
    expect(s.safeParse(100).success).toBe(true);
    expect(mensaje(s.safeParse(100.01))).toBe('La tasa no puede superar 100');
    expect(mensaje(s.safeParse(-1))).toBe('La tasa no puede ser negativo');
    expect(s.safeParse(1.12345).success).toBe(false);
    expect(percentageSchema('La tasa', 2).safeParse(1.123).success).toBe(false);
  });
  it('positivo: rechaza 0', () => {
    expect(percentageSchema('La tasa', 4, true).safeParse(0).success).toBe(false);
  });
});

describe('identifierSchema / optionalIdentifierSchema', () => {
  it('obligatorio, longitud, caracteres y solo ceros', () => {
    const s = identifierSchema('El código', 5);
    expect(mensaje(s.safeParse('  '))).toBe('El código es obligatorio');
    expect(s.safeParse('ABCDEF').success).toBe(false);
    expect(s.safeParse('-AB').success).toBe(false);
    expect(s.safeParse('A B').success).toBe(false);
    expect(mensaje(s.safeParse('000'))).toBe('El código no puede estar formado solo por ceros');
    expect(s.safeParse('A-1/b').success).toBe(true);
  });
  it('opcional admite vacío, null y undefined', () => {
    const s = optionalIdentifierSchema('La referencia', 10);
    expect(s.safeParse('').success).toBe(true);
    expect(s.safeParse(null).success).toBe(true);
    expect(s.safeParse(undefined).success).toBe(true);
    expect(s.safeParse('$$').success).toBe(false);
    expect(s.safeParse('0-0').success).toBe(false);
  });
});

describe('nitSchema', () => {
  it('normaliza a mayúsculas y valida dígito verificador', () => {
    expect(nitSchema.parse(' cf ')).toBe('CF');
    expect(nitSchema.safeParse('1234567-9').success).toBe(true);
    expect(nitSchema.safeParse('1234567-8').success).toBe(false);
    expect(nitSchema.safeParse('1'.repeat(21)).success).toBe(false);
  });
});

describe('soloLetrasSchema / optionalTrimmedText / timeSchema', () => {
  it('solo letras con tildes y ñ', () => {
    const s = soloLetrasSchema('El nombre', 20);
    expect(s.safeParse('José Peña').success).toBe(true);
    expect(s.safeParse('Ruta 1').success).toBe(false);
    expect(s.safeParse('').success).toBe(false);
  });
  it('texto opcional recorta y limita', () => {
    const s = optionalTrimmedText('La nota', 3);
    expect(s.parse('  ab  ')).toBe('ab');
    expect(s.safeParse('abcd').success).toBe(false);
    expect(s.safeParse(null).success).toBe(true);
  });
  it('hora HH:MM en 24 h', () => {
    const s = timeSchema('La hora');
    expect(s.safeParse('08:30').success).toBe(true);
    expect(s.safeParse('23:59').success).toBe(true);
    expect(s.safeParse('24:00').success).toBe(false);
    expect(s.safeParse('8:30').success).toBe(false);
    expect(s.safeParse(undefined).success).toBe(true);
  });
});
