import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import logoCxc from '../../assets/brand/logo-cxc.png';
import logoCxcClaro from '../../assets/brand/logo-cxc-light.png';
import { CalendarRange, CircleDollarSign, HandCoins, Landmark, Lock, ShoppingCart, type LucideIcon } from 'lucide-react';

const MODULOS: { nombre: string; detalle: string; icono: LucideIcon }[] = [
  { nombre: 'Compras', detalle: 'Órdenes y proveedores', icono: ShoppingCart },
  { nombre: 'Cuentas por Cobrar', detalle: 'Facturación, cartera y cobranza', icono: HandCoins },
  { nombre: 'Inventario', detalle: 'Existencias y movimientos', icono: CalendarRange },
  { nombre: 'Bancos', detalle: 'Conciliación y tesorería', icono: Landmark },
  { nombre: 'Cuentas por Pagar', detalle: 'Obligaciones y pagos', icono: CircleDollarSign },
];

/** Logo oficial. `claro` usa la versión con letras blancas para fondos oscuros. */
export const Marca = ({ claro = false, className }: { claro?: boolean; className?: string }) => (
  <img
    src={claro ? logoCxcClaro : logoCxc}
    alt="Cuentas por Cobrar CxC · ERP System"
    width={480} height={194} draggable={false}
    className={`block w-auto select-none ${className ?? (claro ? 'h-20 xl:h-24' : 'h-14')}`}
  />
);

/** Pantalla dividida: panel institucional azul marino a la izquierda, formulario a la derecha. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <aside className="auth-hero relative hidden flex-col justify-between gap-12 overflow-hidden px-12 py-12 text-white lg:flex xl:px-20 xl:py-16">
        <div className="auth-pattern absolute inset-0" aria-hidden="true" />
        {/* Trazos y formas decorativas */}
        <div className="auth-hero-glow absolute -right-40 -top-40 h-[30rem] w-[30rem] rounded-full" aria-hidden="true" />
        <div className="auth-hero-arc absolute -bottom-56 -left-56 h-80 w-80 rounded-full" aria-hidden="true" />
        <svg className="absolute right-0 top-0 h-60 w-60 text-blue-400/20 xl:h-72 xl:w-72" viewBox="0 0 240 240" fill="none" aria-hidden="true">
          <path d="M240 0 L60 180" stroke="currentColor" strokeWidth="1" />
          <path d="M240 56 L116 180" stroke="currentColor" strokeWidth="1" />
        </svg>

        <div className="auth-rise relative"><Marca claro /></div>

        <div className="relative max-w-lg">
          <h2 className="auth-hero-title auth-rise max-w-md" style={{ animationDelay: '60ms' }}>
            Una sola plataforma para la <span className="text-blue-300">operación administrativa y&nbsp;financiera.</span>
          </h2>
          <p className="auth-hero-text auth-rise mt-5 max-w-sm text-slate-300" style={{ animationDelay: '120ms' }}>
            Información centralizada, procesos con trazabilidad y control de accesos por rol.
          </p>

          <div className="auth-rise mt-10 h-px w-full bg-linear-to-r from-blue-400/40 via-blue-400/20 to-transparent" style={{ animationDelay: '160ms' }} aria-hidden="true" />

          <ul className="mt-8 grid grid-cols-2 gap-x-10 gap-y-7">
            {MODULOS.map((m, i) => {
              const Icono = m.icono;
              return (
                <li key={m.nombre} className="auth-rise flex items-start gap-3.5" style={{ animationDelay: `${200 + i * 50}ms` }}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-blue-300 shadow-inner shadow-white/5">
                    <Icono size={20} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="pt-0.5">
                    <span className="auth-mod-name block text-white">{m.nombre}</span>
                    <span className="auth-mod-detail mt-0.5 block text-slate-400">{m.detalle}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="auth-hero-foot auth-rise relative flex items-center gap-2.5 text-slate-400" style={{ animationDelay: '480ms' }}>
          <Lock size={15} className="shrink-0 text-blue-300" aria-hidden="true" />
          <span>Acceso restringido a personal autorizado. La actividad queda registrada.</span>
        </div>
      </aside>

      <main className="auth-main relative flex min-h-screen flex-col overflow-hidden px-6 sm:px-12">
        <div className="auth-main-circle absolute -right-32 -top-32 h-80 w-80 rounded-full" aria-hidden="true" />
        <div className="auth-dots absolute right-12 top-12 hidden h-12 w-12 sm:block" aria-hidden="true" />

        <div className="auth-rise relative pt-8 lg:hidden"><Marca /></div>
        <div className="relative flex flex-1 items-center py-10">
          <div className="auth-rise mx-auto w-full max-w-[420px]" style={{ animationDelay: '80ms' }}>{children}</div>
        </div>
        <footer className="relative flex flex-col items-center gap-2 pb-6 text-center text-slate-400 lg:items-end lg:text-right">
          <nav aria-label="Información legal" className="flex flex-wrap justify-center gap-x-4 gap-y-1 lg:justify-end">
            <Link to="/legal#terminos" className="transition-colors hover:text-blue-800 hover:underline">Términos y condiciones</Link>
            <Link to="/legal#seguridad" className="transition-colors hover:text-blue-800 hover:underline">Política de seguridad</Link>
            <Link to="/legal#uso" className="transition-colors hover:text-blue-800 hover:underline">Uso aceptable</Link>
            <Link to="/legal#propiedad" className="transition-colors hover:text-blue-800 hover:underline">Propiedad</Link>
            <Link to="/legal#cookies" className="transition-colors hover:text-blue-800 hover:underline">Cookies</Link>
          </nav>
          <span>© {new Date().getFullYear()} ERP System · ¿Problemas para ingresar? Contacta al administrador del sistema.</span>
        </footer>
      </main>
    </div>
  );
}
