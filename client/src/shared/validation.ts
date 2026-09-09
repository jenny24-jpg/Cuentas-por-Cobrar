// Validaciones reutilizables para todos los formularios del sistema.
// Ningún formulario debe reimplementar estas reglas por su cuenta — así
// "obligatorio", "solo números" y "fecha válida" se comportan exactamente
// igual en todas partes.

export type ValidationErrors = Record<string, string>;

function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim() === '';
}

/** Campo de texto obligatorio (no vacío, no solo espacios). */
export function validateRequired(value: string | undefined | null, fieldLabel: string): string | undefined {
  if (isBlank(value)) return `${fieldLabel} es obligatorio.`;
  return undefined;
}

/** Para <Select>: debe haber un valor seleccionado. */
export function validateRequiredSelect(value: string | undefined | null, fieldLabel: string): string | undefined {
  if (isBlank(value)) return `Debes seleccionar ${fieldLabel}.`;
  return undefined;
}

interface NumberOptions {
  positive?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
}

/**
 * Valida que el valor sea estrictamente numérico (rechaza letras, símbolos,
 * espacios sueltos). Si el campo está vacío, no marca error aquí — combina
 * con validateRequired si el campo es obligatorio.
 */
export function validateNumber(value: string, fieldLabel: string, opts: NumberOptions = {}): string | undefined {
  if (isBlank(value)) return undefined;
  const trimmed = value.trim();

  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return `${fieldLabel} debe ser un número válido, sin letras ni símbolos.`;
  }

  const num = Number(trimmed);

  if (opts.integer && !Number.isInteger(num)) {
    return `${fieldLabel} debe ser un número entero (sin decimales).`;
  }
  if (opts.positive && num <= 0) {
    return `${fieldLabel} debe ser mayor a 0.`;
  }
  if (opts.min !== undefined && num < opts.min) {
    return `${fieldLabel} debe ser mayor o igual a ${opts.min}.`;
  }
  if (opts.max !== undefined && num > opts.max) {
    return `${fieldLabel} debe ser menor o igual a ${opts.max}.`;
  }
  return undefined;
}

/** Atajo: obligatorio + numérico en un solo paso. */
export function validateRequiredNumber(value: string, fieldLabel: string, opts: NumberOptions = {}): string | undefined {
  const requiredError = validateRequired(value, fieldLabel);
  if (requiredError) return requiredError;
  return validateNumber(value, fieldLabel, opts);
}

function parseDateOnly(value: string): Date | null {
  if (isBlank(value)) return null;
  // "T00:00:00" evita que el navegador interprete la fecha en otra zona
  // horaria y la corra un día para atrás/adelante.
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

interface DateOptions {
  notFuture?: boolean;
  notPast?: boolean;
  /** La fecha debe ser igual o posterior a esta (ej. no antes de otra fecha del mismo formulario). */
  notBefore?: { date: string; label: string };
}

/** Valida formato de fecha y reglas de rango. Vacío no es error aquí (combina con required si aplica). */
export function validateDate(value: string, fieldLabel: string, opts: DateOptions = {}): string | undefined {
  if (isBlank(value)) return undefined;

  const date = parseDateOnly(value);
  if (!date) return `${fieldLabel} no es una fecha válida.`;

  if (opts.notFuture && date > startOfToday()) {
    return `${fieldLabel} no puede ser una fecha futura.`;
  }
  if (opts.notPast && date < startOfToday()) {
    return `${fieldLabel} no puede ser anterior a hoy.`;
  }
  if (opts.notBefore) {
    const otherDate = parseDateOnly(opts.notBefore.date);
    if (otherDate && date < otherDate) {
      return `${fieldLabel} no puede ser anterior a ${opts.notBefore.label}.`;
    }
  }
  return undefined;
}

export function validateRequiredDate(value: string, fieldLabel: string, opts: DateOptions = {}): string | undefined {
  const requiredError = validateRequired(value, fieldLabel);
  if (requiredError) return requiredError;
  return validateDate(value, fieldLabel, opts);
}

export function validateMaxLength(value: string | undefined, fieldLabel: string, max: number): string | undefined {
  if (isBlank(value)) return undefined;
  if ((value as string).length > max) {
    return `${fieldLabel} no puede superar los ${max} caracteres.`;
  }
  return undefined;
}

/** true si el objeto de errores tiene al menos un mensaje real. */
export function hasErrors(errors: ValidationErrors): boolean {
  return Object.values(errors).some((msg) => !!msg);
}