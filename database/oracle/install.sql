-- =============================================================================
-- SCRIPT DE INSTALACIÓN GENERAL - BASE DE DATOS ORACLE ERP UNIVERSITARIO
-- =============================================================================
-- Ejecutar conectado a la instancia Oracle con permisos apropiados (SYSDBA/Schema owner).
--
-- Uso en SQL*Plus o SQL Developer:
-- SQL> @install.sql
-- =============================================================================

SET FEEDBACK ON
SET ECHO OFF
SET VERIFY OFF

PROMPT =========================================================================
PROMPT INICIANDO INSTALACIÓN DEL ESQUEMA ERP UNIVERSITARIO
PROMPT =========================================================================

-- 1. Estructura de Tablas, Secuencias y Constraints (DDL)
PROMPT [1/8] Ejecutando DDL básico...
@@01_ddl/install_ddl.sql

-- 2. Datos Maestros y Catálogos Iniciales
PROMPT [2/8] Insertando registros de catálogos...
@@02_catalogos/install_catalogos.sql

-- 3. Vistas y Queries Consolidadas
PROMPT [3/8] Creando vistas...
@@03_views/install_views.sql

-- 4. Procedimientos, Funciones y Paquetes de Negocio (PL/SQL)
PROMPT [4/8] Compilando paquetes y lógica PL/SQL...
@@04_packages/install_packages.sql

-- 5. Triggers de Auditoría y Reglas
PROMPT [5/8] Habilitando triggers...
@@05_triggers/install_triggers.sql

-- 6. Índices de Rendimiento
PROMPT [6/8] Creando índices de base de datos...
@@06_indexes/install_indexes.sql

-- 7. Roles, Permisos y Grants de Acceso
PROMPT [7/8] Configurando esquemas de seguridad y accesos...
@@07_permissions/install_permissions.sql

-- 8. Casos de Prueba Iniciales / Validación de Instalación
PROMPT [8/8] Ejecutando validación inicial de instalación...
@@08_tests/install_tests.sql

PROMPT =========================================================================
PROMPT INSTALACIÓN FINALIZADA CON ÉXITO
PROMPT =========================================================================
