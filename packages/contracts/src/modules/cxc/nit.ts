// Reglas compartidas (cliente y servidor) para NIT guatemalteco y códigos/identificadores.

/** 'cf', 'C/F', 'c.f.' → 'CF'. El resto: mayúsculas sin espacios, puntos, guiones ni diagonales. */
export function normalizarNit(raw: string | null | undefined): string {
  const compact = String(raw ?? '').toUpperCase().replace(/[\s.\-/]/g, '');
  return compact === 'CF' ? 'CF' : compact;
}

/** Dígito verificador del NIT guatemalteco (módulo 11; resultado 10 = 'K'). */
export function digitoVerificadorNit(cuerpo: string): string {
  const n = cuerpo.length;
  let suma = 0;
  for (let i = 0; i < n; i += 1) suma += Number(cuerpo[i]) * (n + 1 - i);
  const resto = (11 - (suma % 11)) % 11;
  return resto === 10 ? 'K' : String(resto);
}

/**
 * NIT válido: 'CF' o cuerpo numérico + dígito verificador correcto (SAT).
 * El cuerpo no puede empezar en 0 ni ser solo ceros: '00000' cumple el módulo 11
 * pero no es un NIT real.
 */
export function esNitValido(nit: string | null | undefined): boolean {
  const normalizado = normalizarNit(nit);
  if (normalizado === 'CF') return true;
  if (!/^[1-9]\d{1,10}[0-9K]$/.test(normalizado)) return false;
  return digitoVerificadorNit(normalizado.slice(0, -1)) === normalizado.slice(-1);
}

/** Formato visible del NIT: 1234567-9. */
export function formatearNit(nit: string): string {
  const n = normalizarNit(nit);
  return n === 'CF' || n.length < 2 ? n : `${n.slice(0, -1)}-${n.slice(-1)}`;
}

/** Ejemplo de NIT válido para textos de ayuda (1234567 → dígito 9). */
export const NIT_EJEMPLO = '1234567-9';

/** true si el valor solo tiene ceros y separadores (ej. '0', '0000', '00-00', '0/0'). */
export function esSoloCeros(valor: string | null | undefined): boolean {
  const v = String(valor ?? '').trim();
  return v !== '' && /^[0\s\-_/.]+$/.test(v) && v.includes('0');
}
