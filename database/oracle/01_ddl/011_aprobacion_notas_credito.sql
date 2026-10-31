-- =============================================================================
-- MIGRACIÓN 011 — aprobación de notas de crédito.
-- =============================================================================
-- Motivo: una nota de crédito rebaja la deuda del cliente sin que entre dinero,
-- así que debe autorizarla un usuario ADMIN (supervisores, gerentes, directores)
-- distinto de quien la registró. Hasta ahora la tabla no guardaba ni quién creó
-- la nota ni quién la aprobó, por lo que no se podía exigir esa separación.
--
-- Flujo que soporta:
--   PENDIENTE  -> la nota está registrada y espera aprobación (no toca saldos).
--   APLICADA   -> un ADMIN la aprobó: se aplicó a su documento de referencia.
--   ANULADA    -> un ADMIN la rechazó (usa ID_EMPLEADO_ANULACION, FECHA_ANULACION
--                 y MOTIVO_ANULACION, que ya existen).
--
-- Columnas nuevas:
--   ID_EMPLEADO_REGISTRO    quién registró la nota.
--   FECHA_REGISTRO          cuándo se registró.
--   ID_EMPLEADO_APROBACION  quién la aprobó.
--   FECHA_APROBACION        cuándo se aprobó.
-- Todas admiten NULL porque las notas existentes no tienen ese dato. El CHECK
-- impide que la misma persona registre y apruebe la misma nota.
--
-- 100% aditivo: solo ALTER TABLE ADD + FK + CHECK + índices. Ningún DROP,
-- ningún DELETE. Seguro de correr aunque ya haya datos.
-- =============================================================================

PROMPT Migración CxC 011 — aprobación de notas de crédito: iniciando...

ALTER TABLE "PROYECTOANALISIS"."CXC_NOTAS_CREDITO"
  ADD (
    "ID_EMPLEADO_REGISTRO"   NUMBER,
    "FECHA_REGISTRO"         DATE,
    "ID_EMPLEADO_APROBACION" NUMBER,
    "FECHA_APROBACION"       DATE
  );

ALTER TABLE "PROYECTOANALISIS"."CXC_NOTAS_CREDITO"
  ADD CONSTRAINT "FK_CXC_NC_REGISTRO"
  FOREIGN KEY ("ID_EMPLEADO_REGISTRO")
  REFERENCES "PROYECTOANALISIS"."EMPLEADO" ("ID_EMPLEADO");

ALTER TABLE "PROYECTOANALISIS"."CXC_NOTAS_CREDITO"
  ADD CONSTRAINT "FK_CXC_NC_APROBACION"
  FOREIGN KEY ("ID_EMPLEADO_APROBACION")
  REFERENCES "PROYECTOANALISIS"."EMPLEADO" ("ID_EMPLEADO");

-- Separación de funciones: quien aprueba no puede ser quien registró.
ALTER TABLE "PROYECTOANALISIS"."CXC_NOTAS_CREDITO"
  ADD CONSTRAINT "CK_CXC_NC_APROBADOR_DISTINTO"
  CHECK (
    "ID_EMPLEADO_APROBACION" IS NULL
    OR "ID_EMPLEADO_REGISTRO" IS NULL
    OR "ID_EMPLEADO_APROBACION" <> "ID_EMPLEADO_REGISTRO"
  );

CREATE INDEX "PROYECTOANALISIS"."IX_CXC_NC_REGISTRO"
  ON "PROYECTOANALISIS"."CXC_NOTAS_CREDITO" ("ID_EMPLEADO_REGISTRO") TABLESPACE "USERS";

CREATE INDEX "PROYECTOANALISIS"."IX_CXC_NC_APROBACION"
  ON "PROYECTOANALISIS"."CXC_NOTAS_CREDITO" ("ID_EMPLEADO_APROBACION") TABLESPACE "USERS";

PROMPT [1/1] CXC_NOTAS_CREDITO actualizado (registro y aprobación).

--------------------------------------------------------
-- Verificación rápida (debe devolver 4 filas):
--
-- SELECT COLUMN_NAME FROM USER_TAB_COLUMNS
--  WHERE TABLE_NAME = 'CXC_NOTAS_CREDITO'
--    AND COLUMN_NAME IN ('ID_EMPLEADO_REGISTRO','FECHA_REGISTRO',
--                        'ID_EMPLEADO_APROBACION','FECHA_APROBACION');
--
-- Reversa (solo si hubiera que deshacerla; borra los datos de aprobación):
--
-- ALTER TABLE "PROYECTOANALISIS"."CXC_NOTAS_CREDITO" DROP CONSTRAINT "CK_CXC_NC_APROBADOR_DISTINTO";
-- ALTER TABLE "PROYECTOANALISIS"."CXC_NOTAS_CREDITO" DROP CONSTRAINT "FK_CXC_NC_APROBACION";
-- ALTER TABLE "PROYECTOANALISIS"."CXC_NOTAS_CREDITO" DROP CONSTRAINT "FK_CXC_NC_REGISTRO";
-- DROP INDEX "PROYECTOANALISIS"."IX_CXC_NC_APROBACION";
-- DROP INDEX "PROYECTOANALISIS"."IX_CXC_NC_REGISTRO";
-- ALTER TABLE "PROYECTOANALISIS"."CXC_NOTAS_CREDITO"
--   DROP ("ID_EMPLEADO_REGISTRO", "FECHA_REGISTRO", "ID_EMPLEADO_APROBACION", "FECHA_APROBACION");

PROMPT Migración CxC 011 completada.
