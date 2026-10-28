import { useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';

/** Resultado de búsqueda de Nominatim (OpenStreetMap). */
export interface ResultadoDireccion {
  lat: number;
  lon: number;
  nombre: string;
}

interface NominatimItem { lat: string; lon: string; display_name: string; place_id: number }

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** Política de Nominatim: como máximo una petición por segundo. */
const INTERVALO_MINIMO_MS = 1100;

// Caché y control de frecuencia compartidos por todos los buscadores de la sesión.
const cache = new Map<string, ResultadoDireccion[]>();
let ultimaPeticion = 0;
const esperar = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function buscarEnNominatim(texto: string, signal: AbortSignal): Promise<ResultadoDireccion[]> {
  const clave = texto.trim().toLowerCase();
  const enCache = cache.get(clave);
  if (enCache) return enCache;

  const espera = ultimaPeticion + INTERVALO_MINIMO_MS - Date.now();
  if (espera > 0) await esperar(espera);
  ultimaPeticion = Date.now();

  const params = new URLSearchParams({
    q: texto.trim(),
    format: 'jsonv2',
    countrycodes: 'gt',
    limit: '5',
    'accept-language': 'es',
  });
  // Como los mosaicos del mapa: el sitio no envía Referer (no-referrer), pero Nominatim lo exige
  // para identificar la aplicación. Se envía solo el origen, nunca la ruta de la página.
  const res = await fetch(`${NOMINATIM_URL}?${params}`, { signal, referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!res.ok) throw new Error(res.status === 429 ? 'LIMITE' : `HTTP ${res.status}`);
  const items = (await res.json()) as NominatimItem[];
  const resultados = items.map((i) => ({ lat: Number(i.lat), lon: Number(i.lon), nombre: i.display_name }));
  cache.set(clave, resultados);
  return resultados;
}

interface NominatimReverse { address?: Record<string, string>; display_name?: string; error?: string }
const cacheInverso = new Map<string, string | null>();

/**
 * Describe un punto del mapa (geocodificación inversa): "Zona 9, Ciudad de Guatemala".
 * Comparte el límite de 1 consulta/segundo con la búsqueda. null si no se pudo determinar.
 */
export async function describirPunto(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  const clave = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (cacheInverso.has(clave)) return cacheInverso.get(clave) ?? null;
  const espera = ultimaPeticion + INTERVALO_MINIMO_MS - Date.now();
  if (espera > 0) await esperar(espera);
  ultimaPeticion = Date.now();
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), format: 'jsonv2', zoom: '16', 'accept-language': 'es' });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { signal, referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as NominatimReverse;
  const ad = data.address ?? {};
  // En Guatemala, OpenStreetMap guarda la zona en suburb/city_district y el municipio en city/town/village.
  const zona = [ad.suburb, ad.city_district, ad.quarter, ad.neighbourhood].find((v) => v && /zona/i.test(v))
    ?? ad.suburb ?? ad.neighbourhood ?? ad.city_district;
  const municipio = ad.city ?? ad.town ?? ad.village ?? ad.municipality ?? ad.county;
  const departamento = ad.state;
  const partes = [zona, municipio, departamento && departamento !== municipio ? departamento : undefined].filter(Boolean) as string[];
  const texto = partes.length ? Array.from(new Set(partes)).join(', ') : (data.display_name ?? null);
  cacheInverso.set(clave, texto);
  return texto;
}

/** Quita la parte redundante del final ("…, Departamento de Guatemala, 01010, Guatemala"). */
const nombreCorto = (nombre: string) => nombre.replace(/,\s*\d{5}(?=,|$)/g, '').replace(/,\s*Guatemala$/, '');

interface BuscadorDireccionProps {
  /** Texto a buscar (normalmente lo escrito en el campo Dirección). */
  texto: string;
  onSeleccionar: (resultado: ResultadoDireccion) => void;
}

/**
 * Busca una dirección en OpenStreetMap (Nominatim) y fija el punto en el mapa.
 * La búsqueda es con botón, no al escribir: la política de Nominatim no permite autocompletado.
 */
export function BuscadorDireccion({ texto, onSeleccionar }: BuscadorDireccionProps) {
  const [resultados, setResultados] = useState<ResultadoDireccion[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const consulta = texto.trim();
  const puedeBuscar = consulta.length >= 3 && !cargando;

  const buscar = async () => {
    if (!puedeBuscar) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCargando(true); setMensaje(null); setResultados(null); setElegido(null);
    try {
      const encontrados = await buscarEnNominatim(consulta, controller.signal);
      setResultados(encontrados);
      if (!encontrados.length) {
        setMensaje('No se encontró esa dirección. Prueba con la zona, colonia o un lugar cercano (ej. "Avenida Petapa zona 12"), o haz clic en el mapa.');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMensaje((err as Error).message === 'LIMITE'
        ? 'El buscador recibió demasiadas consultas; espera unos segundos e intenta de nuevo.'
        : 'No se pudo consultar el buscador de direcciones. Revisa tu conexión o fija el punto con un clic en el mapa.');
    } finally {
      if (abortRef.current === controller) setCargando(false);
    }
  };

  const seleccionar = (r: ResultadoDireccion) => {
    setElegido(r.nombre);
    setResultados(null);
    onSeleccionar(r);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={buscar}
          disabled={!puedeBuscar}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {cargando ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
          {cargando ? 'Buscando…' : 'Buscar en el mapa'}
        </button>
        <span className="text-xs text-slate-500">
          {consulta.length < 3 ? 'Escribe la dirección (mínimo 3 caracteres) y búscala para ubicarla.' : 'Busca la dirección escrita arriba para colocar el punto automáticamente.'}
        </span>
      </div>

      {resultados && resultados.length > 0 && (
        <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Resultados de la búsqueda">
          {resultados.map((r) => (
            <li key={`${r.lat},${r.lon},${r.nombre}`} className="border-b border-slate-100 last:border-b-0">
              <button
                type="button"
                onClick={() => seleccionar(r)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
              >
                <MapPin size={15} className="mt-0.5 shrink-0 text-blue-700" aria-hidden="true" />
                <span>{nombreCorto(r.nombre)}</span>
              </button>
            </li>
          ))}
          <li className="bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400">
            Búsqueda: © colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a> (Nominatim)
          </li>
        </ul>
      )}

      {elegido && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Punto ubicado en: <strong>{nombreCorto(elegido)}</strong>. Revisa el mapa: si no es el lugar exacto (por ejemplo, el número de casa), haz clic sobre el punto correcto para ajustarlo.
        </p>
      )}
      {mensaje && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{mensaje}</p>}
    </div>
  );
}
