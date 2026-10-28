import { useNavigate } from 'react-router-dom';
import { IlustracionObra } from './IlustracionObra';
import { ArrowRight, BookOpen, CheckCircle2, Landmark, Package, ShoppingCart, FileSpreadsheet, HardHat, type LucideIcon } from 'lucide-react';

export type ModuloEnConstruccion = 'compras' | 'inventario' | 'cuentas-por-pagar' | 'bancos';

interface InfoModulo {
  titulo: string;
  resumen: string;
  icono: LucideIcon;
  previstas: string[];
}

/** Lo que cada módulo cubrirá cuando se construya. Son funcionalidades previstas, no disponibles. */
export const MODULOS_EN_CONSTRUCCION: Record<ModuloEnConstruccion, InfoModulo> = {
  compras: {
    titulo: 'Compras',
    resumen: 'Gestión de órdenes de compra y proveedores.',
    icono: ShoppingCart,
    previstas: ['Catálogo de proveedores', 'Órdenes de compra', 'Cotizaciones', 'Recepción de mercadería'],
  },
  inventario: {
    titulo: 'Inventario',
    resumen: 'Control de existencias y movimientos de productos.',
    icono: Package,
    previstas: ['Existencias por bodega', 'Entradas y salidas', 'Kárdex de productos', 'Ajustes de inventario'],
  },
  'cuentas-por-pagar': {
    titulo: 'Cuentas por Pagar',
    resumen: 'Obligaciones con proveedores y programación de pagos.',
    icono: FileSpreadsheet,
    previstas: ['Facturas de proveedores', 'Programación de pagos', 'Antigüedad de saldos por pagar', 'Notas de crédito de proveedores'],
  },
  bancos: {
    titulo: 'Bancos',
    resumen: 'Tesorería, cuentas bancarias y conciliación.',
    icono: Landmark,
    previstas: ['Cuentas bancarias', 'Depósitos y transferencias', 'Conciliación bancaria', 'Control de chequeras'],
  },
};

export function ModuloEnConstruccionPage({ modulo }: { modulo: ModuloEnConstruccion }) {
  const navigate = useNavigate();
  const info = MODULOS_EN_CONSTRUCCION[modulo];
  const Icono = info.icono;

  return (
    <div className="obra-page mx-auto flex max-w-5xl flex-col gap-6">
      {/* Cinta de obra superior */}
      <div className="obra-cinta h-3 rounded-full" aria-hidden="true" />

      <section className="grid items-center gap-8 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="obra-rise">
          <span className="obra-chip inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-800">
            <HardHat size={14} aria-hidden="true" /> Módulo en construcción
          </span>

          <div className="mt-5 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0e2238] text-amber-300 shadow-md shadow-slate-900/20">
              <Icono size={22} aria-hidden="true" />
            </span>
            <h1 className="obra-title text-[#0e2238]">{info.titulo}</h1>
          </div>

          <p className="obra-lead mt-4 text-slate-600">
            Estamos trabajando en este módulo. {info.resumen} Mientras tanto, puedes seguir operando con Cuentas por Cobrar.
          </p>

          <div className="mt-6" aria-hidden="true">
            <div className="flex items-center justify-between text-slate-500">
              <span className="obra-label">En desarrollo</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="obra-progreso h-full w-full rounded-full" />
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={() => navigate('/cxc/dashboard')}
              className="obra-btn inline-flex h-11 items-center gap-2 rounded-full bg-blue-800 px-5 text-white shadow-[0_10px_24px_-10px_rgba(30,64,175,0.6)] transition hover:-translate-y-0.5 hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
              Ir a Cuentas por Cobrar <ArrowRight size={17} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => navigate('/cxc/tutoriales')}
              className="obra-btn inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
              <BookOpen size={17} aria-hidden="true" /> Ver tutoriales
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          <IlustracionObra />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-[#0e2238]">Lo que incluirá este módulo</h2>
        <p className="mt-1 text-slate-500">Funcionalidades previstas; todavía no están disponibles.</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {info.previstas.map((f) => (
            <li key={f} className="obra-item flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 text-slate-700">
              <CheckCircle2 size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
              {f}
              <span className="obra-pronto ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Próximamente</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
