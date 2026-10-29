-- =============================================================================
-- MIGRACIÓN 011 — Sucursal en rutas y empleados, ubicación de sucursales y
--                 código propio de cliente.
-- =============================================================================
-- 1) CXC_RUTAS.ID_SUCURSAL y EMPLEADO.ID_SUCURSAL: sucursal a la que pertenece cada
--    ruta y cada empleado. Las columnas aceptan vacío A PROPÓSITO: los registros
--    existentes quedan sin sucursal y el DBA decide cómo asignarlos. La obligatoriedad
--    para registros nuevos la aplica la aplicación (formularios y servidor).
-- 2) CXC_SUCURSALES.LATITUD / LONGITUD (opcionales): permiten sugerir la sucursal más
--    cercana a la primera parada de una ruta.
-- 3) CLIENTE.CODIGO_CLIENTE (CLI-00001): código propio, único, generado por el servidor.
--    A los clientes existentes se les asigna en orden de ID_CLIENTE.
-- 4) Índice único sobre CXC_RUTAS.CODIGO_RUTA: el código de ruta ahora lo genera el
--    servidor (RUT-001) y no debe repetirse.
--
-- 100% aditivo, sin PL/SQL ni triggers. Ejecutar UNA vez (si una columna ya existe,
-- Oracle responde ORA-01430 y se puede omitir esa línea).
-- =============================================================================

PROMPT Migración 011 — sucursal y códigos: iniciando...

-- 1) Sucursal en rutas y empleados
ALTER TABLE CXC_RUTAS ADD (ID_SUCURSAL NUMBER);
ALTER TABLE CXC_RUTAS ADD CONSTRAINT FK_CXC_RUTAS_SUCURSAL FOREIGN KEY (ID_SUCURSAL) REFERENCES CXC_SUCURSALES (ID_SUCURSAL);
CREATE INDEX IX_CXC_RUTAS_SUCURSAL ON CXC_RUTAS (ID_SUCURSAL);

ALTER TABLE EMPLEADO ADD (ID_SUCURSAL NUMBER);
ALTER TABLE EMPLEADO ADD CONSTRAINT FK_EMPLEADO_SUCURSAL FOREIGN KEY (ID_SUCURSAL) REFERENCES CXC_SUCURSALES (ID_SUCURSAL);
CREATE INDEX IX_EMPLEADO_SUCURSAL ON EMPLEADO (ID_SUCURSAL);

-- 2) Ubicación de la sucursal (grados decimales)
ALTER TABLE CXC_SUCURSALES ADD (LATITUD NUMBER(9,6), LONGITUD NUMBER(9,6));
ALTER TABLE CXC_SUCURSALES ADD CONSTRAINT CK_CXC_SUC_LATITUD CHECK (LATITUD IS NULL OR LATITUD BETWEEN -90 AND 90);
ALTER TABLE CXC_SUCURSALES ADD CONSTRAINT CK_CXC_SUC_LONGITUD CHECK (LONGITUD IS NULL OR LONGITUD BETWEEN -180 AND 180);

-- 3) Código de cliente
ALTER TABLE CLIENTE ADD (CODIGO_CLIENTE VARCHAR2(20));

UPDATE CLIENTE c
   SET c.CODIGO_CLIENTE = (SELECT 'CLI-' || LPAD(x.RN, 5, '0')
                             FROM (SELECT ID_CLIENTE, ROW_NUMBER() OVER (ORDER BY ID_CLIENTE) AS RN FROM CLIENTE) x
                            WHERE x.ID_CLIENTE = c.ID_CLIENTE)
 WHERE c.CODIGO_CLIENTE IS NULL;

CREATE UNIQUE INDEX UX_CLIENTE_CODIGO ON CLIENTE (CODIGO_CLIENTE);

-- 4) Código de ruta único
CREATE UNIQUE INDEX UX_CXC_RUTAS_CODIGO ON CXC_RUTAS (CODIGO_RUTA);

COMMIT;

-- Verificación: debe devolver 4 filas de columnas nuevas y 0 clientes sin código
SELECT TABLE_NAME, COLUMN_NAME FROM USER_TAB_COLUMNS
 WHERE (TABLE_NAME = 'CXC_RUTAS' AND COLUMN_NAME = 'ID_SUCURSAL')
    OR (TABLE_NAME = 'EMPLEADO' AND COLUMN_NAME = 'ID_SUCURSAL')
    OR (TABLE_NAME = 'CXC_SUCURSALES' AND COLUMN_NAME IN ('LATITUD', 'LONGITUD'))
    OR (TABLE_NAME = 'CLIENTE' AND COLUMN_NAME = 'CODIGO_CLIENTE');
SELECT COUNT(*) AS CLIENTES_SIN_CODIGO FROM CLIENTE WHERE CODIGO_CLIENTE IS NULL;

PROMPT Migración 011 — terminada.
