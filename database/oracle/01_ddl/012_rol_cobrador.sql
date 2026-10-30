-- =============================================================================
-- MIGRACIÓN 012 — Rol COBRADOR.
-- =============================================================================
-- Agrega el rol COBRADOR a los roles permitidos de SEG_USUARIOS. Un cobrador puede
-- consultar todo y registrar únicamente trabajo de campo (gestiones de cobro,
-- promesas de pago, cobros de ruta y bitácora de visitas); el resto de las
-- operaciones de escritura las rechaza el servidor.
--
-- No cambia ni borra datos: solo amplía la lista de valores válidos de SEG_USUARIOS.ROL.
-- Sin PL/SQL ni triggers.
-- =============================================================================

PROMPT Migración 012 — rol COBRADOR: iniciando...

ALTER TABLE SEG_USUARIOS DROP CONSTRAINT CK_SEG_USU_ROL;
ALTER TABLE SEG_USUARIOS ADD CONSTRAINT CK_SEG_USU_ROL CHECK (ROL IN ('ADMIN', 'OPERADOR', 'CONSULTA', 'COBRADOR'));

-- Verificación: debe mostrar los 4 roles
SELECT SEARCH_CONDITION_VC AS ROLES_PERMITIDOS FROM USER_CONSTRAINTS WHERE CONSTRAINT_NAME = 'CK_SEG_USU_ROL';

PROMPT Migración 012 — terminada.
