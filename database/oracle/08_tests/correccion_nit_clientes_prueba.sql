-- =============================================================================
-- Corrección de NIT de clientes de prueba (18 registros)
-- Generado el 2026-10-26. Solo cambia el dígito verificador (último carácter) de los NIT
-- de clientes de PRUEBA que no lo cumplían; el resto del número, nombres e historial
-- no se tocan. Cada UPDATE verifica el valor anterior: si alguien ya cambió ese NIT,
-- la fila no se modifica.
-- =============================================================================
UPDATE CLIENTE SET NIT = '7823456-5' WHERE ID_CLIENTE = 242 AND NIT = '7823456-1'; -- Comercial El Roble
UPDATE CLIENTE SET NIT = '326589-7' WHERE ID_CLIENTE = 243 AND NIT = '326589-K'; -- Ferretería La Central
UPDATE CLIENTE SET NIT = '10945872-9' WHERE ID_CLIENTE = 244 AND NIT = '10945872-3'; -- Papelería El Estudiante
UPDATE CLIENTE SET NIT = '897432-2' WHERE ID_CLIENTE = 246 AND NIT = '897432-5'; -- Panadería Las Espigas
UPDATE CLIENTE SET NIT = '6342189-5' WHERE ID_CLIENTE = 247 AND NIT = '6342189-K'; -- Textiles La Primavera
UPDATE CLIENTE SET NIT = '11567324-5' WHERE ID_CLIENTE = 248 AND NIT = '11567324-8'; -- Repuestos El Motor
UPDATE CLIENTE SET NIT = '2987654-0' WHERE ID_CLIENTE = 249 AND NIT = '2987654-2'; -- Abarrotes La Esperanza
UPDATE CLIENTE SET NIT = '763821-3' WHERE ID_CLIENTE = 250 AND NIT = '763821-4'; -- Tecnología Horizonte
UPDATE CLIENTE SET NIT = '9124567-2' WHERE ID_CLIENTE = 251 AND NIT = '9124567-6'; -- Muebles El Cedro
UPDATE CLIENTE SET NIT = '12389765-3' WHERE ID_CLIENTE = 252 AND NIT = '12389765-K'; -- Librería Mundo de Letras
UPDATE CLIENTE SET NIT = '567234-1' WHERE ID_CLIENTE = 253 AND NIT = '567234-8'; -- Calzado Buen Paso
UPDATE CLIENTE SET NIT = '3489126-9' WHERE ID_CLIENTE = 254 AND NIT = '3489126-3'; -- Agroinsumos La Cosecha
UPDATE CLIENTE SET NIT = '10678234-7' WHERE ID_CLIENTE = 255 AND NIT = '10678234-5'; -- Servicios Integrales Aurora
UPDATE CLIENTE SET NIT = '8215679-4' WHERE ID_CLIENTE = 256 AND NIT = '8215679-K'; -- Materiales de Construcción La Cima
UPDATE CLIENTE SET NIT = '435678-0' WHERE ID_CLIENTE = 257 AND NIT = '435678-1'; -- Cafetería Grano Dorado
UPDATE CLIENTE SET NIT = '6791234-6' WHERE ID_CLIENTE = 258 AND NIT = '6791234-7'; -- Productos de Limpieza Brisa
UPDATE CLIENTE SET NIT = '13245678-8' WHERE ID_CLIENTE = 259 AND NIT = '13245678-9'; -- Empaques del Pacífico
UPDATE CLIENTE SET NIT = '2548917-8' WHERE ID_CLIENTE = 260 AND NIT = '2548917-4'; -- Suministros de Oficina El Faro

COMMIT;

-- Verificación: debe devolver 18.
SELECT COUNT(*) AS CORREGIDOS FROM CLIENTE WHERE (ID_CLIENTE, NIT) IN (
  (242, '7823456-5'),
  (243, '326589-7'),
  (244, '10945872-9'),
  (246, '897432-2'),
  (247, '6342189-5'),
  (248, '11567324-5'),
  (249, '2987654-0'),
  (250, '763821-3'),
  (251, '9124567-2'),
  (252, '12389765-3'),
  (253, '567234-1'),
  (254, '3489126-9'),
  (255, '10678234-7'),
  (256, '8215679-4'),
  (257, '435678-0'),
  (258, '6791234-6'),
  (259, '13245678-8'),
  (260, '2548917-8')
);
