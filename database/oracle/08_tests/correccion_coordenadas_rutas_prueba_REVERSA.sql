-- =============================================================================
-- REVERSA: devuelve las coordenadas de prueba a sus valores originales
-- Generado el 2026-10-27. Las visitas de prueba tenían coordenadas de ejemplo (14.61, 14.62, ...)
-- que no correspondían a su dirección. Las nuevas coordenadas salen de geocodificar cada
-- dirección con OpenStreetMap (Nominatim); donde OpenStreetMap no tiene
-- mapeadas las zonas (Quetzaltenango, Chimaltenango, Escuintla) se usa el centro del municipio. Solo cambian LATITUD y LONGITUD; cada UPDATE
-- exige el valor anterior, así que no toca filas que alguien ya haya corregido.
-- =============================================================================
UPDATE CXC_RUTA_DETALLE SET LATITUD = 14.61, LONGITUD = -90.52
 WHERE ID_RUTA_DETALLE = 282 AND LATITUD = 14.479745 AND LONGITUD = -90.5347; -- Panadería Las Espigas · Zona 1, Villa Canales, Guatemala
UPDATE CXC_RUTA_DETALLE SET LATITUD = 14.62, LONGITUD = -90.53
 WHERE ID_RUTA_DETALLE = 283 AND LATITUD = 14.846461 AND LONGITUD = -91.519421; -- Textiles La Primavera · Zona 3, Quetzaltenango, Quetzaltenango
UPDATE CXC_RUTA_DETALLE SET LATITUD = 14.63, LONGITUD = -90.54
 WHERE ID_RUTA_DETALLE = 284 AND LATITUD = 14.302286 AND LONGITUD = -90.786624; -- Repuestos El Motor · Zona 2, Escuintla, Escuintla
UPDATE CXC_RUTA_DETALLE SET LATITUD = 14.64, LONGITUD = -90.55
 WHERE ID_RUTA_DETALLE = 285 AND LATITUD = 14.661304 AND LONGITUD = -90.819349; -- Abarrotes La Esperanza · Zona 1, Chimaltenango, Chimaltenango
UPDATE CXC_RUTA_DETALLE SET LATITUD = 14.65, LONGITUD = -90.56
 WHERE ID_RUTA_DETALLE = 286 AND LATITUD = 14.602933 AND LONGITUD = -90.510754; -- Tecnología Horizonte · Zona 10, Ciudad de Guatemala, Guatemala

COMMIT;
