import { vi } from 'vitest';

/**
 * Conexión Oracle simulada para recorrer cada rama de un repositorio.
 * Cada regla asocia un fragmento de SQL con la respuesta que daría Oracle;
 * la primera regla cuyo patrón coincide responde. Todas las sentencias quedan
 * registradas para verificar qué se escribió y en qué orden.
 */
export interface Regla {
  sql: RegExp;
  rows?: unknown[];
  outId?: number;
}

export interface Ejecucion {
  sql: string;
  binds: Record<string, unknown>;
}

export function crearConexion(reglas: Regla[]) {
  const ejecuciones: Ejecucion[] = [];
  const conn = {
    execute: vi.fn(async (sql: string, binds: Record<string, unknown> = {}) => {
      const limpio = sql.replace(/\s+/g, ' ').trim();
      ejecuciones.push({ sql: limpio, binds });
      const regla = reglas.find((r) => r.sql.test(limpio));
      if (regla?.outId !== undefined) return { outBinds: { id: [regla.outId] } };
      return { rows: regla?.rows ?? [], rowsAffected: 1 };
    }),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const ejecuto = (patron: RegExp) => ejecuciones.filter((e) => patron.test(e.sql));
  return { conn, ejecuciones, ejecuto };
}
