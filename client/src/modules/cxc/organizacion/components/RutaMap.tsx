import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface RutaMapPoint {
  id: number;
  lat: number;
  lon: number;
  label: string;
  orden?: number;
}

interface RutaMapProps {
  points?: RutaMapPoint[];
  selectedId?: number;
  onSelect?: (id: number) => void;
  /** Modo selección: un clic en el mapa fija la ubicación. */
  pick?: { lat: number; lon: number } | null;
  onPick?: (lat: number, lon: number) => void;
  heightClass?: string;
  /** Área permitida de la ruta: círculo de radio `km` alrededor de la primera parada. */
  area?: { lat: number; lon: number; km: number } | null;
}

const GUATEMALA: L.LatLngExpression = [14.6349, -90.5069];

/**
 * Proveedor de mosaicos. Por defecto, los servidores públicos de OpenStreetMap (uso moderado,
 * con atribución). Para producción con mucho tráfico se puede apuntar a otro proveedor
 * (p. ej. MapTiler con su clave) definiendo VITE_MAPA_TILES_URL y VITE_MAPA_TILES_ATRIBUCION.
 */
const TILES_URL = import.meta.env.VITE_MAPA_TILES_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILES_ATRIBUCION = import.meta.env.VITE_MAPA_TILES_ATRIBUCION
  || '&copy; Colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/** Pin con número de parada: azul del sistema; rojo cuando está seleccionado. */
const pin = (text: string, active: boolean) => L.divIcon({
  className: 'ruta-pin',
  iconSize: [34, 44],
  iconAnchor: [17, 42],
  tooltipAnchor: [0, -38],
  html: `<div class="ruta-pin__cuerpo${active ? ' is-activo' : ''}"><span>${text}</span></div>`,
});

/** Mapa OpenStreetMap interactivo (Leaflet): paradas numeradas o selección de punto por clic. */
export function RutaMap({ points = [], selectedId, onSelect, pick, onPick, heightClass = 'h-80', area }: RutaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  const onSelectRef = useRef(onSelect);
  onPickRef.current = onPick;
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false, zoomControl: false }).setView(GUATEMALA, 12);
    L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
    L.tileLayer(TILES_URL, {
      maxZoom: 19,
      attribution: TILES_ATRIBUCION,
      // index.html desactiva el Referer en todo el sitio (no-referrer), pero los servidores de
      // OpenStreetMap bloquean ("Access blocked", 403) las peticiones sin él. Para los mosaicos
      // se envía solo el origen (p. ej. http://localhost:5173), nunca la ruta ni datos de la página.
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => onPickRef.current?.(e.latlng.lat, e.latlng.lng));
    // La rueda del mouse solo hace zoom después de hacer clic en el mapa: no interrumpe el scroll de la página.
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    mapRef.current = map;
    // El contenedor puede montarse dentro de un modal con animación: recalcula el tamaño.
    const timer = window.setTimeout(() => map.invalidateSize(), 200);
    return () => { window.clearTimeout(timer); map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: L.LatLngTuple[] = [];

    if (area) {
      // Área donde pueden estar las paradas: no captura clics para no estorbar al fijar un punto.
      L.circle([area.lat, area.lon], {
        radius: area.km * 1000, color: '#1e40af', weight: 1.5, dashArray: '6 6', fillColor: '#3b82f6', fillOpacity: 0.06, interactive: false,
      }).addTo(layer);
    }

    points.forEach((p) => {
      const active = p.id === selectedId;
      L.marker([p.lat, p.lon], { icon: pin(String(p.orden ?? ''), active), zIndexOffset: active ? 1000 : 0, title: p.label })
        .on('click', () => onSelectRef.current?.(p.id))
        .bindTooltip(p.label, { direction: 'top', className: 'ruta-tooltip' })
        .addTo(layer);
      bounds.push([p.lat, p.lon]);
    });
    if (pick) {
      L.marker([pick.lat, pick.lon], { icon: pin('★', true) }).addTo(layer);
      bounds.push([pick.lat, pick.lon]);
    }

    const selected = points.find((p) => p.id === selectedId);
    if (selected) map.setView([selected.lat, selected.lon], Math.max(map.getZoom(), 15));
    else if (pick) map.setView([pick.lat, pick.lon], Math.max(map.getZoom(), 15));
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
    else if (bounds.length === 1) map.setView(bounds[0], 15);
  }, [points, selectedId, pick, area]);

  return (
    <div
      ref={containerRef}
      className={`ruta-mapa w-full ${heightClass} rounded-xl border border-slate-200 shadow-sm z-0`}
      role="application"
      aria-label="Mapa de ubicaciones. Haz clic en el mapa para usar la rueda del mouse como zoom."
    />
  );
}
