import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, TriangleAlert } from 'lucide-react';

/** Piezas compartidas de las pantallas de acceso (login, recuperación y cambio de contraseña). */

export const AuthHeading = ({ titulo, texto }: { titulo: string; texto?: ReactNode }) => (
  <div className="mb-8">
    <span className="mb-5 block h-1 w-10 rounded-full bg-blue-800" aria-hidden="true" />
    <h1 className="auth-title text-[#0e2238]">{titulo}</h1>
    {texto && <p className="auth-lead mt-2 text-slate-500">{texto}</p>}
  </div>
);

const TONOS = {
  error: { caja: 'border-red-200 bg-red-50 text-red-800', Icono: AlertCircle },
  aviso: { caja: 'border-amber-200 bg-amber-50 text-amber-900', Icono: TriangleAlert },
  ok: { caja: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icono: CheckCircle2 },
} as const;

export function AuthAlert({ tono, children, sacudir }: { tono: keyof typeof TONOS; children: ReactNode; sacudir?: number }) {
  const { caja, Icono } = TONOS[tono];
  return (
    <div key={sacudir} role={tono === 'error' ? 'alert' : 'status'} className={`${tono === 'error' ? 'auth-shake ' : ''}mb-5 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${caja}`}>
      <Icono size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  ayuda?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  /** Muestra el botón para ver/ocultar el texto (campos de contraseña). */
  alternarVisible?: boolean;
  visible?: boolean;
  onAlternar?: () => void;
  /** Ícono decorativo opcional a la izquierda del campo. */
  icono?: ReactNode;
}

export function Campo({ label, value, onChange, error, ayuda, inputRef, alternarVisible, visible, onAlternar, icono, id, type = 'text', ...resto }: CampoProps) {
  const auto = useId();
  const inputId = id ?? `campo-${auto.replace(/:/g, '')}`;
  const errorId = `${inputId}-error`;
  const ayudaId = `${inputId}-ayuda`;
  return (
    <div>
      <label htmlFor={inputId} className="form-label auth-label mb-2 block text-slate-800">{label}</label>
      <div className="group relative">
        {icono && (
          <span className={`pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 transition-colors ${error ? 'text-red-500' : 'text-slate-500 group-focus-within:text-blue-800'}`} aria-hidden="true">
            {icono}
          </span>
        )}
        <input
          {...resto}
          ref={inputRef} id={inputId} value={value} onChange={(e) => onChange(e.target.value)}
          type={alternarVisible ? (visible ? 'text' : 'password') : type}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : ayuda ? ayudaId : undefined}
          className={`auth-input h-12 w-full rounded-xl border bg-white px-4 text-slate-900 shadow-sm shadow-slate-200/60 outline-none transition duration-200 placeholder:text-slate-400 focus:ring-4 ${icono ? 'pl-11' : ''} ${alternarVisible ? 'pr-12' : ''} ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 hover:border-slate-300 focus:border-blue-700 focus:ring-blue-100'}`}
        />
        {alternarVisible && (
          <button type="button" onClick={onAlternar} aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`} aria-pressed={visible}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
          </button>
        )}
      </div>
      {error
        ? <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
        : ayuda && <div id={ayudaId} className="mt-1.5 text-xs text-slate-500">{ayuda}</div>}
    </div>
  );
}

export function BotonPrincipal({ cargando, textoCargando, children, ...props }: { cargando?: boolean; textoCargando?: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={props.disabled || cargando}
      className="auth-btn flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-blue-800 bg-linear-to-r from-blue-800 to-blue-700 text-white shadow-[0_12px_28px_-10px_rgba(30,64,175,0.65)] transition duration-200 hover:-translate-y-0.5 hover:from-blue-900 hover:to-blue-800 hover:shadow-[0_16px_32px_-10px_rgba(30,64,175,0.7)] active:translate-y-0 active:shadow-[0_8px_18px_-10px_rgba(30,64,175,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
    >
      {cargando ? (<><Loader2 size={17} className="animate-spin" aria-hidden="true" /> {textoCargando ?? 'Procesando…'}</>) : children}
    </button>
  );
}

/** Estado local para alternar la visibilidad de varios campos de contraseña a la vez. */
export const useVisible = () => {
  const [visible, setVisible] = useState(false);
  return { visible, alternar: () => setVisible((v) => !v) };
};
