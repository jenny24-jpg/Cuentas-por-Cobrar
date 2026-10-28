import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowUp, BadgeCheck, CalendarDays, Cookie, FileText, Lock, Scale, ScrollText, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { Marca } from '../auth/AuthShell';

/** Versión y vigencia de los textos legales; actualizar al modificar cualquier sección. */
export const LEGAL_VERSION = '1.0';
export const LEGAL_VIGENCIA = '24 de octubre de 2026';

/** Titulares del programa (autores y propietarios). */
export const TITULARES = ['Laura Calvillo', 'Angel Galeano', 'Jennifer Santos', 'Jose Lopez', 'Kevin Enriquez'];

type Seccion = { id: string; titulo: string; icono: typeof FileText; contenido: ReactNode };

const Lista = ({ items }: { items: ReactNode[] }) => (
  <ul className="legal-list">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

const SECCIONES: Seccion[] = [
  {
    id: 'terminos',
    titulo: 'Términos y condiciones de uso',
    icono: FileText,
    contenido: (
      <>
        <p>
          Estos términos regulan el acceso y uso de <strong>ERP System</strong> (en adelante, «el Sistema»), incluido su módulo de
          Cuentas por Cobrar. Al iniciar sesión, el usuario declara haberlos leído y aceptarlos. Si no está de acuerdo, debe abstenerse
          de usar el Sistema.
        </p>
        <h3>1. Acceso</h3>
        <Lista items={[
          'El acceso es exclusivo para personal autorizado por la organización que opera el Sistema. Las cuentas las crea un administrador; no existe registro público.',
          'Cada cuenta es personal e intransferible. El usuario es responsable de toda actividad realizada con sus credenciales.',
          'Los permisos dependen del rol asignado (Administrador, Operador o Consulta) y pueden modificarse o revocarse en cualquier momento.',
        ]} />
        <h3>2. Obligaciones del usuario</h3>
        <Lista items={[
          'Mantener la confidencialidad de su contraseña y cambiar de inmediato la contraseña temporal asignada.',
          'Registrar información veraz y completa (clientes, documentos, pagos, gestiones de cobro).',
          'Notificar al administrador cualquier acceso no autorizado, pérdida de credenciales o comportamiento anómalo del Sistema.',
          'Cerrar sesión al terminar, especialmente en equipos compartidos.',
        ]} />
        <h3>3. Disponibilidad</h3>
        <p>
          El Sistema se ofrece «tal como está». Se procura su funcionamiento continuo, pero puede haber interrupciones por mantenimiento,
          actualizaciones o causas ajenas. No se compromete un nivel de servicio específico salvo que se pacte por escrito en un
          contrato aparte.
        </p>
        <h3>4. Responsabilidad</h3>
        <p>
          La organización usuaria es responsable de la exactitud de los datos que registra y de las decisiones de cobro, crédito o
          facturación que tome con base en ellos. Los titulares del Sistema no responden por daños derivados de un uso indebido,
          de datos incorrectos ingresados por los usuarios o de la divulgación de credenciales por parte de estos.
        </p>
        <h3>5. Suspensión</h3>
        <p>
          El administrador puede desactivar, bloquear o cerrar las sesiones de una cuenta ante incumplimiento de estos términos,
          sospecha de uso indebido o por razones de seguridad.
        </p>
        <h3>6. Cambios</h3>
        <p>
          Estos términos pueden actualizarse. La versión vigente y su fecha se indican al inicio de esta página; el uso continuado
          del Sistema después de un cambio implica su aceptación.
        </p>
      </>
    ),
  },
  {
    id: 'propiedad',
    titulo: 'Propiedad intelectual',
    icono: Users,
    contenido: (
      <>
        <p>
          El Sistema —su código fuente y objeto, diseño de base de datos, interfaces, textos, logotipos y documentación— es una obra
          protegida por la Ley de Derecho de Autor y Derechos Conexos de Guatemala (Decreto 33-98) y los tratados internacionales
          aplicables. Sus autores y titulares son:
        </p>
        <ul className="legal-owners">
          {TITULARES.map((nombre) => (
            <li key={nombre}><UserCheck size={16} aria-hidden="true" /> {nombre}</li>
          ))}
        </ul>
        <p>Queda prohibido, sin autorización previa y por escrito de los titulares:</p>
        <Lista items={[
          'Copiar, reproducir, modificar, traducir o crear obras derivadas del Sistema.',
          'Descompilar, aplicar ingeniería inversa o intentar obtener el código fuente.',
          'Vender, sublicenciar, alquilar, distribuir o poner el Sistema a disposición de terceros.',
          'Eliminar o alterar los avisos de autoría y propiedad.',
        ]} />
        <p>
          El uso del Sistema otorga únicamente una licencia de uso limitada, no exclusiva e intransferible; no transfiere ningún
          derecho de propiedad. <strong>Los datos que registra la organización usuaria siguen siendo de su propiedad.</strong>
        </p>
      </>
    ),
  },
  {
    id: 'uso',
    titulo: 'Política de uso aceptable',
    icono: ScrollText,
    contenido: (
      <>
        <p>El Sistema debe usarse solo para la gestión administrativa y financiera de la organización. No está permitido:</p>
        <Lista items={[
          'Compartir credenciales o usar la cuenta de otra persona.',
          'Intentar acceder a módulos, datos o funciones fuera de los permisos del rol asignado.',
          'Registrar información falsa, alterar saldos o documentos sin respaldo, o eliminar evidencia de operaciones.',
          'Extraer o divulgar datos de clientes y deudores con fines ajenos a la gestión de cobro de la organización.',
          'Realizar pruebas de intrusión, escaneos, ataques de fuerza bruta o cargas automatizadas sin autorización escrita.',
          'Introducir código malicioso o interferir con el funcionamiento del Sistema.',
        ]} />
        <p>
          El incumplimiento puede dar lugar a la suspensión inmediata de la cuenta y a las acciones disciplinarias, civiles o penales que
          correspondan.
        </p>
      </>
    ),
  },
  {
    id: 'seguridad',
    titulo: 'Política de seguridad',
    icono: ShieldCheck,
    contenido: (
      <>
        <p>El Sistema aplica, entre otras, las siguientes medidas para proteger la información:</p>
        <h3>Contraseñas y acceso</h3>
        <Lista items={[
          'Las contraseñas se guardan cifradas con un algoritmo de derivación robusto (scrypt) y sal única; nunca en texto claro.',
          'Política de contraseñas: mínimo 10 caracteres con mayúsculas, minúsculas, números y símbolos; sin el nombre de usuario ni palabras comunes.',
          'Bloqueo temporal de la cuenta tras varios intentos fallidos y límites de intentos por dirección IP.',
          'Las contraseñas temporales deben cambiarse en el primer ingreso; mientras tanto, el resto del Sistema queda bloqueado.',
          'Recuperación de contraseña mediante enlace de un solo uso que vence a los 30 minutos.',
        ]} />
        <h3>Sesiones</h3>
        <Lista items={[
          'La sesión se cierra automáticamente tras 30 minutos sin actividad y dura como máximo 10 horas.',
          'Cerrar sesión, cambiar la contraseña o cambiar el rol de un usuario revoca sus sesiones de inmediato.',
          'Si se detecta la reutilización de un token de sesión, se revocan todas las sesiones de ese usuario.',
        ]} />
        <h3>Permisos y trazabilidad</h3>
        <Lista items={[
          'Control de acceso por roles: Administrador (todo), Operador (Cuentas por Cobrar) y Consulta (solo lectura, validado en el servidor).',
          'Bitácora de accesos: ingresos, intentos fallidos, bloqueos, cambios de contraseña y acciones administrativas, con fecha, IP y navegador.',
          'Historial de movimientos de cada documento (aplicaciones, reversas, ajustes aprobados y anulaciones).',
        ]} />
        <h3>Comunicaciones</h3>
        <p>
          En producción, el Sistema debe operar exclusivamente sobre HTTPS (cifrado TLS), y la cookie de sesión se marca como segura
          para que solo viaje por conexiones cifradas.
        </p>
        <h3>Reporte de incidentes</h3>
        <p>
          Cualquier sospecha de incidente de seguridad (acceso indebido, credenciales expuestas, datos alterados) debe reportarse de
          inmediato al administrador del Sistema.
        </p>
      </>
    ),
  },
  {
    id: 'confidencialidad',
    titulo: 'Confidencialidad y tratamiento de datos',
    icono: Lock,
    contenido: (
      <>
        <p>
          El Sistema procesa datos de clientes y deudores (identificación, NIT, contacto, documentos, saldos, pagos y gestiones de
          cobro) por cuenta y bajo las instrucciones de la organización usuaria, que es la responsable de esos datos.
        </p>
        <h3>Compromisos de los titulares</h3>
        <Lista items={[
          'No usar, vender, ceder ni revelar los datos de la organización usuaria ni los de sus clientes.',
          'Tratar los datos solo para prestar el servicio y por las instrucciones de la organización usuaria.',
          'Exigir confidencialidad a cualquier persona que, por soporte o mantenimiento, tenga acceso a los datos.',
          'Notificar sin demora a la organización usuaria cualquier incidente de seguridad que afecte sus datos.',
          'Al terminar la relación, devolver o eliminar los datos según lo indique la organización usuaria.',
        ]} />
        <h3>Compromisos de los usuarios</h3>
        <p>
          Los usuarios deben guardar reserva sobre la información de clientes y deudores a la que accedan, aun después de dejar de
          tener acceso al Sistema, y usarla únicamente para las funciones propias de su cargo.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    titulo: 'Cookies y almacenamiento local',
    icono: Cookie,
    contenido: (
      <>
        <p>
          El Sistema <strong>no usa cookies publicitarias ni de análisis</strong>, ni comparte información con terceros con esos fines.
          Solo guarda en el navegador lo estrictamente necesario para funcionar:
        </p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr><th>Nombre</th><th>Tipo</th><th>Finalidad</th><th>Duración</th></tr>
            </thead>
            <tbody>
              <tr><td><code>erp_rt</code></td><td>Cookie técnica (HttpOnly)</td><td>Mantener la sesión iniciada de forma segura.</td><td>Hasta cerrar sesión o vencer la sesión</td></tr>
              <tr><td><code>erp.ultimoUsuario</code></td><td>Almacenamiento local</td><td>Recordar el nombre de usuario, solo si se marca «Recordar mi usuario».</td><td>Hasta desmarcar la opción</td></tr>
              <tr><td><code>cxc.tutoriales.completados</code></td><td>Almacenamiento local</td><td>Recordar qué tutoriales ya se completaron.</td><td>Hasta borrar los datos del navegador</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Como son elementos imprescindibles para el funcionamiento, no requieren consentimiento previo. Pueden eliminarse desde la
          configuración del navegador; en ese caso será necesario volver a iniciar sesión.
        </p>
      </>
    ),
  },
  {
    id: 'aviso',
    titulo: 'Aviso legal y contacto',
    icono: Scale,
    contenido: (
      <>
        <p>
          <strong>ERP System</strong> es propiedad de {TITULARES.slice(0, -1).join(', ')} y {TITULARES[TITULARES.length - 1]}.
          Estos textos se rigen por las leyes de la República de Guatemala.
        </p>
        <p>
          Para consultas sobre estos términos, solicitudes relativas a datos o reportes de seguridad, comuníquese con el administrador
          del Sistema de su organización.
        </p>
      </>
    ),
  },
];


/** Distancia desde el borde superior a la que una sección se considera «la que se está leyendo». */
const OFFSET_LECTURA = 140;

const numero = (i: number) => String(i + 1).padStart(2, '0');

const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Términos y condiciones, políticas y propiedad del Sistema. Pública: se enlaza desde el login. */
export default function LegalPage() {
  const { hash } = useLocation();
  const [activa, setActiva] = useState(hash ? hash.slice(1) : SECCIONES[0].id);
  const [progreso, setProgreso] = useState(0);
  const [mostrarSubir, setMostrarSubir] = useState(false);
  const navRef = useRef<HTMLUListElement>(null);

  // Con el enrutador del navegador, el ancla inicial no siempre se desplaza sola.
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return; }
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  // Resalta en el índice la sección que se está leyendo y calcula el avance de lectura.
  useEffect(() => {
    let frame = 0;
    const actualizar = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgreso(max > 0 ? Math.min(1, window.scrollY / max) : 1);
      setMostrarSubir(window.scrollY > 600);

      // Al llegar al final, la última sección queda activa aunque sea corta.
      if (max > 0 && window.scrollY >= max - 4) { setActiva(SECCIONES[SECCIONES.length - 1].id); return; }
      let actual = SECCIONES[0].id;
      for (const { id } of SECCIONES) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= OFFSET_LECTURA) actual = id;
      }
      setActiva(actual);
    };
    const programar = () => { if (!frame) frame = window.requestAnimationFrame(actualizar); };
    actualizar();
    window.addEventListener('scroll', programar, { passive: true });
    window.addEventListener('resize', programar);
    return () => {
      window.removeEventListener('scroll', programar);
      window.removeEventListener('resize', programar);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // En móvil el índice es horizontal: mantener a la vista la pestaña activa.
  useEffect(() => {
    if (!window.matchMedia('(max-width: 1023px)').matches) return;
    const lista = navRef.current;
    const item = lista?.querySelector<HTMLElement>(`[data-seccion="${activa}"]`);
    if (lista && item) lista.scrollTo({ left: item.offsetLeft - lista.clientWidth / 2 + item.clientWidth / 2, behavior: sinMovimiento() ? 'auto' : 'smooth' });
  }, [activa]);

  const irA = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: sinMovimiento() ? 'auto' : 'smooth', block: 'start' });
    window.history.replaceState(window.history.state, '', `#${id}`);
    setActiva(id);
  };

  return (
    <div className="legal-page min-h-screen bg-slate-50">
      {/* Barra de progreso de lectura */}
      <div className="fixed inset-x-0 top-0 z-40 h-[3px]" aria-hidden="true">
        <div className="h-full origin-left bg-linear-to-r from-blue-800 to-blue-500" style={{ transform: `scaleX(${progreso})` }} />
      </div>

      <header className="auth-hero relative overflow-hidden text-white">
        <div className="auth-pattern absolute inset-0" aria-hidden="true" />
        <div className="auth-hero-glow absolute -right-40 -top-40 h-[30rem] w-[30rem] rounded-full" aria-hidden="true" />
        <svg className="absolute right-0 top-0 hidden h-64 w-64 text-blue-400/20 md:block" viewBox="0 0 240 240" fill="none" aria-hidden="true">
          <path d="M240 0 L60 180" stroke="currentColor" strokeWidth="1" />
          <path d="M240 56 L116 180" stroke="currentColor" strokeWidth="1" />
        </svg>

        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-8 sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Marca claro className="h-16 sm:h-[72px]" />
            <Link to="/login" className="legal-back inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-white backdrop-blur-sm transition hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
              <ArrowLeft size={16} aria-hidden="true" /> Volver al sistema
            </Link>
          </div>

          <div className="auth-rise mt-14 max-w-2xl">
            <span className="legal-eyebrow inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-300/10 px-3 py-1 text-blue-200">
              <Scale size={13} aria-hidden="true" /> Centro legal
            </span>
            <h1 className="legal-title mt-5">Términos, políticas y <span className="text-blue-300">propiedad</span></h1>
            <p className="legal-intro mt-4 max-w-xl text-slate-300">
              Las reglas de uso de ERP System, cómo se protege la información y a quién pertenece el programa.
            </p>
          </div>
        </div>
      </header>

      {/* Ficha resumen superpuesta a la cabecera */}
      <div className="relative z-10 mx-auto -mt-10 max-w-6xl px-6 sm:px-10">
        <dl className="auth-rise grid grid-cols-1 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(14,34,56,0.35)] sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ animationDelay: '80ms' }}>
          {[
            { Icono: BadgeCheck, etiqueta: 'Versión', valor: LEGAL_VERSION },
            { Icono: CalendarDays, etiqueta: 'Vigente desde', valor: LEGAL_VIGENCIA },
            { Icono: Users, etiqueta: 'Titulares', valor: `${TITULARES.length} autores` },
          ].map(({ Icono, etiqueta, valor }) => (
            <div key={etiqueta} className="flex items-center gap-3.5 px-6 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-800"><Icono size={18} aria-hidden="true" /></span>
              <div>
                <dt className="legal-fact-label text-slate-500">{etiqueta}</dt>
                <dd className="legal-fact-value text-[#0e2238]">{valor}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-10 sm:px-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Contenido" className="sticky top-0 z-20 -mx-6 border-b border-slate-200 bg-slate-50/95 px-6 py-3 backdrop-blur sm:-mx-10 sm:px-10 lg:top-8 lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <p className="legal-nav-heading mb-3 hidden px-3 text-slate-400 lg:block">Contenido</p>
          <ul ref={navRef} className="legal-nav-list flex gap-1.5 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {SECCIONES.map(({ id, titulo }, i) => {
              const esActiva = activa === id;
              return (
                <li key={id} data-seccion={id} className="shrink-0">
                  <a href={`#${id}`} onClick={(e) => irA(e, id)} aria-current={esActiva ? 'location' : undefined}
                    className={`legal-nav group relative flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200 ${esActiva ? 'is-active bg-white text-blue-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/70 hover:text-slate-900'}`}>
                    <span className={`absolute inset-y-2 left-0 hidden w-[3px] rounded-full bg-blue-800 transition-opacity duration-200 lg:block ${esActiva ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
                    <span className={`legal-nav-num tabular-nums transition-colors ${esActiva ? 'text-blue-800' : 'text-slate-300 group-hover:text-slate-400'}`}>{numero(i)}</span>
                    <span className="whitespace-nowrap lg:whitespace-normal">{titulo}</span>
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 hidden rounded-xl border border-slate-200 bg-white p-4 lg:block">
            <div className="flex items-center justify-between">
              <span className="legal-nav-heading text-slate-400">Lectura</span>
              <span className="legal-nav-num tabular-nums text-blue-800">{Math.round(progreso * 100)}%</span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-800" style={{ width: `${progreso * 100}%` }} />
            </div>
          </div>
        </nav>

        <main className="space-y-5">
          {SECCIONES.map(({ id, titulo, icono: Icono, contenido }, i) => {
            const esActiva = activa === id;
            return (
              <section key={id} id={id} aria-labelledby={`${id}-titulo`}
                className={`legal-section relative scroll-mt-24 overflow-hidden rounded-2xl border bg-white p-6 transition-[border-color,box-shadow] duration-300 sm:p-9 lg:scroll-mt-8 ${esActiva ? 'border-blue-200 shadow-[0_14px_36px_-24px_rgba(30,64,175,0.45)]' : 'border-slate-200 shadow-sm'}`}>
                <span className={`absolute inset-x-0 top-0 h-[3px] bg-linear-to-r from-blue-800 to-blue-500 transition-opacity duration-300 ${esActiva ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-50 to-blue-100 text-blue-800 ring-1 ring-blue-100">
                    <Icono size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <span className="legal-section-num block text-blue-800/70">Sección {numero(i)}</span>
                    <h2 id={`${id}-titulo`} className="mt-0.5 text-[#0e2238]">{titulo}</h2>
                  </div>
                </div>
                <div className="legal-body mt-6 border-t border-slate-100 pt-6">{contenido}</div>
              </section>
            );
          })}

          <footer className="flex flex-col items-center gap-1.5 pt-6 text-center text-slate-400">
            <span>© {new Date().getFullYear()} ERP System</span>
            <span>{TITULARES.join(' · ')}</span>
          </footer>
        </main>
      </div>

      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: sinMovimiento() ? 'auto' : 'smooth' })}
        aria-label="Volver arriba" title="Volver arriba" tabIndex={mostrarSubir ? 0 : -1}
        className={`fixed bottom-6 right-6 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-[#0e2238] text-white shadow-lg shadow-slate-900/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${mostrarSubir ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}>
        <ArrowUp size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
