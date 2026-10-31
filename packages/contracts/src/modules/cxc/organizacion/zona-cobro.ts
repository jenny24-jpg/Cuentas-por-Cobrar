/**
 * Zona de cobro (CXC_ZONAS_COBRO): territorio de una ruta y ubicación de un cliente.
 * Dos niveles: municipio completo (zona = null, p. ej. "Villa Canales") o una zona
 * dentro del municipio (p. ej. "Villa Canales - Zona 4").
 *
 * Pertenencia de un cliente a la zona de una ruta:
 * - Ruta de municipio completo: entran los clientes de cualquier zona de ese municipio.
 * - Ruta de una zona específica: entran solo los clientes de esa zona.
 */
export interface ZonaCobro {
  id: number;
  codigo: string;
  nombre: string;
  departamento: string;
  municipio: string;
  /** null = todo el municipio. */
  zona: string | null;
  idSucursal: number | null;
}
