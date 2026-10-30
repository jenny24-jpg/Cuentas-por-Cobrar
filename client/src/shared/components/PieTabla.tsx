import { useState } from 'react';

/** Cantidades de registros por página que puede elegir el usuario (el servidor acepta hasta 100). */
export const TAMANOS_PAGINA = [10, 25, 50, 100] as const;

const CLAVE = (pantalla: string) => `erp.tamanoPagina.${pantalla}`;

/**
 * Registros por página de una tabla, recordados por pantalla en el navegador del
 * usuario. Si el almacenamiento no está disponible (modo privado), usa el valor inicial.
 */
export function useTamanoPagina(pantalla: string, inicial = 10): [number, (tamano: number) => void] {
  const [tamano, setTamano] = useState<number>(() => {
    try {
      const guardado = Number(window.localStorage.getItem(CLAVE(pantalla)));
      return (TAMANOS_PAGINA as readonly number[]).includes(guardado) ? guardado : inicial;
    } catch {
      return inicial;
    }
  });

  const cambiar = (nuevo: number) => {
    setTamano(nuevo);
    try {
      window.localStorage.setItem(CLAVE(pantalla), String(nuevo));
    } catch {
      // Sin almacenamiento: la elección dura mientras la pantalla esté abierta.
    }
  };

  return [tamano, cambiar];
}

interface PieTablaProps {
  /** Total de registros que cumplen la búsqueda. */
  total: number;
  /** Página actual (desde 1). */
  pagina: number;
  /** Registros mostrados en esta página. */
  cantidad: number;
  tamano: number;
  /** Cambia la cantidad por página; quien llama debe volver a la página 1. */
  onTamanoChange: (tamano: number) => void;
  /** Cómo se llaman los registros: "registros", "clientes", "usuarios"... */
  etiqueta?: string;
}

/** Selector "Mostrar 10/25/50/100 por página" y rango visible, para el pie de las tablas. */
export function PieTabla({ total, pagina, cantidad, tamano, onTamanoChange, etiqueta = 'registros' }: PieTablaProps) {
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1;
  const hasta = total === 0 ? 0 : desde + cantidad - 1;

  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <label className="inline-flex items-center gap-2">
        <span>Mostrar</span>
        <select
          value={tamano}
          onChange={(e) => onTamanoChange(Number(e.target.value))}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Registros por página"
        >
          {TAMANOS_PAGINA.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>por página</span>
      </label>
      <span>Mostrando {desde}–{hasta} de {total} {etiqueta}</span>
    </span>
  );
}
