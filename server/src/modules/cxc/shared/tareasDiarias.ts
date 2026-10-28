import { businessTodayIso } from '../../../shared/date';
import { logger } from '../../../shared/logger';
import { recalcularPendientes } from '../repositories/credito/mora.repository';
import { cerrarVencidas } from '../repositories/cobranza/promesaPago.repository';
import { recalcularIncumplidos } from '../repositories/cobranza/convenioPago.repository';

/** Cada cuánto se revisa si cambió el día de negocio. */
const INTERVALO_MS = 60 * 60 * 1000;

/**
 * Cierres que dependen del paso del tiempo y antes solo corrían con un botón:
 * mora del día, promesas vencidas y convenios incumplidos. Corren al arrancar y
 * luego una vez por cada día de negocio de Guatemala. Cada tarea es independiente:
 * si una falla se registra y las demás siguen. Los botones manuales siguen igual.
 */
export async function ejecutarTareasDiarias(hoy: string = businessTodayIso()): Promise<void> {
  const tareas: Array<[string, () => Promise<unknown>]> = [
    ['mora', () => recalcularPendientes(hoy)],
    ['promesas', () => cerrarVencidas(hoy)],
    ['convenios', () => recalcularIncumplidos()],
  ];
  for (const [tarea, ejecutar] of tareas) {
    try {
      const resultado = await ejecutar();
      logger.info('tarea_diaria_ok', { tarea, hoy, resultado });
    } catch (error) {
      logger.error('tarea_diaria_fallo', { tarea, hoy, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

/** Programa las tareas; devuelve una función para detenerlas al apagar el servidor. */
export function programarTareasDiarias(): () => void {
  let ultimoDia: string | null = null;
  let enCurso = false;

  const revisar = async () => {
    const hoy = businessTodayIso();
    if (enCurso || hoy === ultimoDia) return;
    enCurso = true;
    try {
      await ejecutarTareasDiarias(hoy);
      ultimoDia = hoy;
    } finally {
      enCurso = false;
    }
  };

  void revisar();
  const timer = setInterval(() => void revisar(), INTERVALO_MS);
  timer.unref();
  return () => clearInterval(timer);
}
