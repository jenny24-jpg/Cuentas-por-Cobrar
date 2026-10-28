-- =============================================================================
-- REVERSA: devuelve los NIT de prueba a sus valores originales
-- Generado el 2026-10-26. Solo cambia el dígito verificador (último carácter) de los NIT
-- de clientes de PRUEBA que no lo cumplían; el resto del número, nombres e historial
-- no se tocan. Cada UPDATE verifica el valor anterior: si alguien ya cambió ese NIT,
-- la fila no se modifica.
-- =============================================================================
UPDATE CLIENTE SET NIT = '7823456-1' WHERE ID_CLIENTE = 242 AND NIT = '7823456-5'; -- Comercial El Roble
UPDATE CLIENTE SET NIT = '326589-K' WHERE ID_CLIENTE = 243 AND NIT = '326589-7'; -- Ferretería La Central
UPDATE CLIENTE SET NIT = '10945872-3' WHERE ID_CLIENTE = 244 AND NIT = '10945872-9'; -- Papelería El Estudiante
UPDATE CLIENTE SET NIT = '897432-5' WHERE ID_CLIENTE = 246 AND NIT = '897432-2'; -- Panadería Las Espigas
UPDATE CLIENTE SET NIT = '6342189-K' WHERE ID_CLIENTE = 247 AND NIT = '6342189-5'; -- Textiles La Primavera
UPDATE CLIENTE SET NIT = '11567324-8' WHERE ID_CLIENTE = 248 AND NIT = '11567324-5'; -- Repuestos El Motor
UPDATE CLIENTE SET NIT = '2987654-2' WHERE ID_CLIENTE = 249 AND NIT = '2987654-0'; -- Abarrotes La Esperanza
UPDATE CLIENTE SET NIT = '763821-4' WHERE ID_CLIENTE = 250 AND NIT = '763821-3'; -- Tecnología Horizonte
UPDATE CLIENTE SET NIT = '9124567-6' WHERE ID_CLIENTE = 251 AND NIT = '9124567-2'; -- Muebles El Cedro
UPDATE CLIENTE SET NIT = '12389765-K' WHERE ID_CLIENTE = 252 AND NIT = '12389765-3'; -- Librería Mundo de Letras
UPDATE CLIENTE SET NIT = '567234-8' WHERE ID_CLIENTE = 253 AND NIT = '567234-1'; -- Calzado Buen Paso
UPDATE CLIENTE SET NIT = '3489126-3' WHERE ID_CLIENTE = 254 AND NIT = '3489126-9'; -- Agroinsumos La Cosecha
UPDATE CLIENTE SET NIT = '10678234-5' WHERE ID_CLIENTE = 255 AND NIT = '10678234-7'; -- Servicios Integrales Aurora
UPDATE CLIENTE SET NIT = '8215679-K' WHERE ID_CLIENTE = 256 AND NIT = '8215679-4'; -- Materiales de Construcción La Cima
UPDATE CLIENTE SET NIT = '435678-1' WHERE ID_CLIENTE = 257 AND NIT = '435678-0'; -- Cafetería Grano Dorado
UPDATE CLIENTE SET NIT = '6791234-7' WHERE ID_CLIENTE = 258 AND NIT = '6791234-6'; -- Productos de Limpieza Brisa
UPDATE CLIENTE SET NIT = '13245678-9' WHERE ID_CLIENTE = 259 AND NIT = '13245678-8'; -- Empaques del Pacífico
UPDATE CLIENTE SET NIT = '2548917-4' WHERE ID_CLIENTE = 260 AND NIT = '2548917-8'; -- Suministros de Oficina El Faro

COMMIT;
