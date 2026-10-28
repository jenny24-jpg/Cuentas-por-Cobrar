// Reglas de planificación de rutas de cobro, compartidas por cliente y servidor.
// Cambiar un valor aquí lo cambia en la pantalla y en la validación del servidor.

/**
 * Jornada del cobrador: de lunes a viernes, de 07:00 a 18:00. Sábado y domingo son de descanso.
 * Las rutas, las visitas y las reprogramaciones solo pueden caer dentro de esta jornada, para no
 * sobrecargar al cobrador con visitas fuera de horario o en su día libre.
 */
export const REGLAS_RUTA = {
  /** Días laborables del cobrador: 1 = lunes … 5 = viernes (0 = domingo y 6 = sábado son de descanso). */
  diasVisita: [1, 2, 3, 4, 5] as readonly number[],
  /** Horario de visitas (HH:MM, hora de Guatemala). */
  horaInicio: '07:00',
  horaFin: '18:00',
  /** Minutos mínimos entre dos paradas de la misma ruta. */
  separacionMinutos: 20,
  /** Distancia máxima (km, línea recta) de cada parada respecto a la primera parada de la ruta. */
  radioKmDefecto: 5,
  radioKmMinimo: 1,
  radioKmMaximo: 50,
  /** A partir de este porcentaje del radio se muestra un aviso (no bloquea). */
  avisoRadioPorcentaje: 0.8,
} as const;

export const NOMBRE_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

/** Texto de la jornada para mostrar en pantallas y mensajes. */
export const JORNADA_COBRADOR = 'lunes a viernes, de 07:00 a 18:00';

/** Mensaje cuando una fecha cae en día de descanso del cobrador. */
export function mensajeDiaDescanso(fechaIso: string): string {
  return `El ${NOMBRE_DIAS[diaSemana(fechaIso)]} es día de descanso del cobrador; las visitas se programan de lunes a viernes.`;
}

/** Día de la semana (0 = domingo) de una fecha civil YYYY-MM-DD, sin desfases de huso horario. */
export function diaSemana(fechaIso: string): number {
  const [y, m, d] = fechaIso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** true si la fecha cae en un día laborable del cobrador (lunes a viernes). */
export function esDiaDeVisita(fechaIso: string): boolean {
  return REGLAS_RUTA.diasVisita.includes(diaSemana(fechaIso));
}

/** "HH:MM" → minutos desde la medianoche; NaN si el formato no es válido. */
export function minutosDelDia(hora: string | null | undefined): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hora ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

/** Minutos desde la medianoche → "HH:MM". */
export function horaDesdeMinutos(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** true si la hora está dentro del horario de visitas. */
export function esHoraDeVisita(hora: string): boolean {
  const m = minutosDelDia(hora);
  return m >= minutosDelDia(REGLAS_RUTA.horaInicio) && m <= minutosDelDia(REGLAS_RUTA.horaFin);
}

/**
 * Primera parada que choca con `hora` (menos de `separacionMinutos` de diferencia), o null.
 * `ocupadas` son las horas programadas de las demás paradas de la ruta.
 */
export function choqueDeHorario(hora: string, ocupadas: Array<string | null | undefined>): string | null {
  const m = minutosDelDia(hora);
  for (const h of ocupadas) {
    const o = minutosDelDia(h);
    if (!Number.isNaN(o) && Math.abs(o - m) < REGLAS_RUTA.separacionMinutos) return h as string;
  }
  return null;
}

/** Primera hora libre (cada 5 min) a partir de `desde` que respeta la separación, o null si no hay. */
export function primeraHoraLibre(ocupadas: Array<string | null | undefined>, desde: string = REGLAS_RUTA.horaInicio): string | null {
  const fin = minutosDelDia(REGLAS_RUTA.horaFin);
  let m = Math.max(minutosDelDia(desde), minutosDelDia(REGLAS_RUTA.horaInicio));
  m = Math.ceil(m / 5) * 5;
  for (; m <= fin; m += 5) {
    const h = horaDesdeMinutos(m);
    if (!choqueDeHorario(h, ocupadas)) return h;
  }
  return null;
}

/** Distancia en km (línea recta, fórmula de Haversine) entre dos coordenadas. */
export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Transiciones de estado permitidas para una ruta. */
export const TRANSICIONES_RUTA: Record<string, readonly string[]> = {
  PLANIFICADA: ['PLANIFICADA', 'EN_PROCESO', 'CANCELADA'],
  EN_PROCESO: ['EN_PROCESO', 'COMPLETADA', 'CANCELADA'],
  COMPLETADA: ['COMPLETADA'],
  CANCELADA: ['CANCELADA'],
};
