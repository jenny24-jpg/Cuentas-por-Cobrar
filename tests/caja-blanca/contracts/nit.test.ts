import { describe, expect, it } from 'vitest';
import {
  NIT_EJEMPLO,
  digitoVerificadorNit,
  esNitValido,
  esSoloCeros,
  formatearNit,
  normalizarNit,
} from '../../../packages/contracts/src/modules/cxc/nit';

describe('normalizarNit', () => {
  it('reconoce las variantes de Consumidor Final', () => {
    for (const cf of ['cf', 'C/F', 'c.f.', ' C F ']) expect(normalizarNit(cf)).toBe('CF');
  });
  it('quita separadores y pasa a mayúsculas', () => {
    expect(normalizarNit('1234567-9')).toBe('12345679');
    expect(normalizarNit('576.093-k')).toBe('576093K');
  });
  it('trata null/undefined como cadena vacía', () => {
    expect(normalizarNit(null)).toBe('');
    expect(normalizarNit(undefined)).toBe('');
  });
});

describe('digitoVerificadorNit (módulo 11)', () => {
  it('calcula el dígito del ejemplo oficial', () => {
    expect(digitoVerificadorNit('1234567')).toBe('9');
  });
  it('rama resto 10 → K', () => {
    // Se busca un cuerpo cuyo resultado sea 10 para cubrir la rama 'K'.
    const cuerpo = Array.from({ length: 999 }, (_, i) => String(1000 + i)).find((c) => digitoVerificadorNit(c) === 'K');
    expect(cuerpo).toBeDefined();
    expect(esNitValido(`${cuerpo}K`)).toBe(true);
  });
  it('rama resto 11 → 0', () => {
    const cuerpo = Array.from({ length: 999 }, (_, i) => String(1000 + i)).find((c) => digitoVerificadorNit(c) === '0');
    expect(cuerpo).toBeDefined();
  });
});

describe('esNitValido', () => {
  it('acepta CF y el NIT de ejemplo', () => {
    expect(esNitValido('CF')).toBe(true);
    expect(esNitValido(NIT_EJEMPLO)).toBe(true);
  });
  it('rechaza dígito verificador incorrecto', () => {
    expect(esNitValido('1234567-8')).toBe(false);
  });
  it('rechaza formatos inválidos: cero inicial, muy corto, letras, solo ceros', () => {
    expect(esNitValido('01234567')).toBe(false);
    expect(esNitValido('1')).toBe(false);
    expect(esNitValido('ABC-1')).toBe(false);
    expect(esNitValido('00000')).toBe(false);
    expect(esNitValido('')).toBe(false);
  });
});

describe('formatearNit', () => {
  it('inserta el guion antes del dígito verificador', () => {
    expect(formatearNit('12345679')).toBe('1234567-9');
  });
  it('deja CF y valores de un carácter tal cual', () => {
    expect(formatearNit('c/f')).toBe('CF');
    expect(formatearNit('7')).toBe('7');
  });
});

describe('esSoloCeros', () => {
  it.each(['0', '0000', '00-00', '0/0', ' 0.0 '])('detecta %s', (v) => expect(esSoloCeros(v)).toBe(true));
  it.each(['', '   ', '--', '10', 'A0', null, undefined])('no marca %s', (v) => expect(esSoloCeros(v)).toBe(false));
});
