-- =============================================================================
-- 010_rutas_planificacion.sql
-- Planificación de rutas de cobro: radio por ruta, hora programada por parada y
-- versionado de las columnas de "asignación de documentos" que ya existían en la
-- base pero no en los scripts del repositorio.
--
-- IDEMPOTENTE: cada objeto se crea solo si no existe. En la base actual solo agrega
-- lo nuevo (RADIO_KM, HORA_PROGRAMADA y sus CHECK); en una instalación limpia crea
-- también las columnas, índices y llaves de asignación. Se puede ejecutar más de una vez.
--
-- Requiere: install_ddl.sql y 001..009 ya aplicados.
-- =============================================================================
SET SERVEROUTPUT ON

DECLARE
  PROCEDURE ejecutar(p_sql VARCHAR2, p_desc VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
    DBMS_OUTPUT.PUT_LINE('  + ' || p_desc);
  END;

  FUNCTION existe_columna(p_tabla VARCHAR2, p_columna VARCHAR2) RETURN BOOLEAN IS
    n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO n FROM USER_TAB_COLUMNS WHERE TABLE_NAME = p_tabla AND COLUMN_NAME = p_columna;
    RETURN n > 0;
  END;

  FUNCTION existe_constraint(p_nombre VARCHAR2) RETURN BOOLEAN IS
    n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO n FROM USER_CONSTRAINTS WHERE CONSTRAINT_NAME = p_nombre;
    RETURN n > 0;
  END;

  FUNCTION existe_indice(p_nombre VARCHAR2) RETURN BOOLEAN IS
    n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO n FROM USER_INDEXES WHERE INDEX_NAME = p_nombre;
    RETURN n > 0;
  END;

  PROCEDURE columna(p_tabla VARCHAR2, p_columna VARCHAR2, p_def VARCHAR2) IS
  BEGIN
    IF NOT existe_columna(p_tabla, p_columna) THEN
      ejecutar('ALTER TABLE ' || p_tabla || ' ADD (' || p_columna || ' ' || p_def || ')', p_tabla || '.' || p_columna);
    END IF;
  END;

  PROCEDURE restriccion(p_tabla VARCHAR2, p_nombre VARCHAR2, p_def VARCHAR2) IS
  BEGIN
    IF NOT existe_constraint(p_nombre) THEN
      ejecutar('ALTER TABLE ' || p_tabla || ' ADD CONSTRAINT ' || p_nombre || ' ' || p_def, p_nombre);
    END IF;
  END;

  PROCEDURE indice(p_nombre VARCHAR2, p_def VARCHAR2) IS
  BEGIN
    IF NOT existe_indice(p_nombre) THEN
      ejecutar('CREATE ' || p_def, p_nombre);
    END IF;
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('[1/4] Asignación de documentos a rutas (columnas existentes, ahora versionadas)');
  columna('CXC_RUTA_DETALLE', 'ID_DOCUMENTO',   'NUMBER');
  columna('CXC_RUTA_DETALLE', 'ID_COBRADOR',    'NUMBER');
  columna('CXC_RUTA_DETALLE', 'MONTO_ASIGNADO', 'NUMBER(14,2)');
  columna('CXC_RUTA_DETALLE', 'LATITUD',        'NUMBER(10,7)');
  columna('CXC_RUTA_DETALLE', 'LONGITUD',       'NUMBER(11,7)');
  restriccion('CXC_RUTA_DETALLE', 'FK_CXC_RD_DOCUMENTO', 'FOREIGN KEY (ID_DOCUMENTO) REFERENCES CXC_DOCUMENTOS (ID_DOCUMENTO)');
  restriccion('CXC_RUTA_DETALLE', 'FK_CXC_RD_COBRADOR',  'FOREIGN KEY (ID_COBRADOR) REFERENCES EMPLEADO (ID_EMPLEADO)');
  restriccion('CXC_RUTA_DETALLE', 'CK_CXC_RD_LAT', 'CHECK (LATITUD BETWEEN -90 AND 90)');
  restriccion('CXC_RUTA_DETALLE', 'CK_CXC_RD_LON', 'CHECK (LONGITUD BETWEEN -180 AND 180)');
  restriccion('CXC_RUTA_DETALLE', 'CK_CXC_RD_ASIGNACION',
    'CHECK (ID_DOCUMENTO IS NULL OR (ID_COBRADOR IS NOT NULL AND MONTO_ASIGNADO IS NOT NULL AND MONTO_ASIGNADO > 0 AND LATITUD IS NOT NULL AND LONGITUD IS NOT NULL))');
  indice('IX_CXC_RD_DOC', 'INDEX IX_CXC_RD_DOC ON CXC_RUTA_DETALLE (ID_DOCUMENTO)');
  -- Un documento solo una vez por ruta (las paradas sin documento no cuentan).
  indice('UQ_CXC_RD_RUTA_DOC', 'UNIQUE INDEX UQ_CXC_RD_RUTA_DOC ON CXC_RUTA_DETALLE (CASE WHEN ID_DOCUMENTO IS NOT NULL THEN ID_RUTA END, ID_DOCUMENTO)');

  DBMS_OUTPUT.PUT_LINE('[2/4] Cobros y gestiones ligados a la parada (columnas existentes, ahora versionadas)');
  columna('CXC_APLICACION_PAGOS', 'ID_RUTA_DETALLE', 'NUMBER');
  columna('CXC_APLICACION_PAGOS', 'CLAVE_RUTA',      'VARCHAR2(36)');
  restriccion('CXC_APLICACION_PAGOS', 'FK_CXC_AP_RUTA_DET', 'FOREIGN KEY (ID_RUTA_DETALLE) REFERENCES CXC_RUTA_DETALLE (ID_RUTA_DETALLE)');
  indice('IX_CXC_AP_RUTA_DET', 'INDEX IX_CXC_AP_RUTA_DET ON CXC_APLICACION_PAGOS (ID_RUTA_DETALLE)');
  -- Evita aplicar dos veces el mismo cobro de ruta si la petición se reintenta.
  indice('UQ_CXC_AP_CLAVE_RUTA', 'UNIQUE INDEX UQ_CXC_AP_CLAVE_RUTA ON CXC_APLICACION_PAGOS (CLAVE_RUTA)');
  columna('CXC_GESTIONES_COBRO', 'ID_RUTA_DETALLE', 'NUMBER');
  restriccion('CXC_GESTIONES_COBRO', 'FK_CXC_GC_RUTA_DET', 'FOREIGN KEY (ID_RUTA_DETALLE) REFERENCES CXC_RUTA_DETALLE (ID_RUTA_DETALLE)');

  DBMS_OUTPUT.PUT_LINE('[3/4] NUEVO: radio de la ruta y hora programada de cada parada');
  -- Distancia máxima (km, línea recta) de cada parada respecto a la primera parada de la ruta.
  columna('CXC_RUTAS', 'RADIO_KM', 'NUMBER(4,1) DEFAULT 5 NOT NULL');
  restriccion('CXC_RUTAS', 'CK_CXC_RUTAS_RADIO', 'CHECK (RADIO_KM BETWEEN 1 AND 50)');
  -- Hora acordada para la visita (HH:MM). HORA_VISITA queda como la hora REAL en que se registró la visita.
  columna('CXC_RUTA_DETALLE', 'HORA_PROGRAMADA', 'VARCHAR2(5)');
  restriccion('CXC_RUTA_DETALLE', 'CK_CXC_RD_HORA_PROG',
    'CHECK (HORA_PROGRAMADA IS NULL OR REGEXP_LIKE(HORA_PROGRAMADA, ''^([01][0-9]|2[0-3]):[0-5][0-9]$''))');
END;
/

PROMPT [4/4] Datos: la hora cargada en HORA_VISITA pasa a ser la hora programada
-- Hasta ahora HORA_VISITA guardaba la hora planificada (formulario "Agregar parada") o la hora
-- en que se registró la visita. Se copia a HORA_PROGRAMADA y, en las paradas aún PENDIENTES,
-- se limpia HORA_VISITA porque todavía no hubo visita real.
UPDATE CXC_RUTA_DETALLE
   SET HORA_PROGRAMADA = SUBSTR(TRIM(HORA_VISITA), 1, 5)
 WHERE HORA_PROGRAMADA IS NULL
   AND REGEXP_LIKE(TRIM(HORA_VISITA), '^([01][0-9]|2[0-3]):[0-5][0-9]');

UPDATE CXC_RUTA_DETALLE
   SET HORA_VISITA = NULL
 WHERE ESTADO_VISITA = 'PENDIENTE'
   AND HORA_VISITA IS NOT NULL;

COMMIT;

-- Verificación: debe devolver 2 filas (RADIO_KM y HORA_PROGRAMADA).
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_DEFAULT
  FROM USER_TAB_COLUMNS
 WHERE (TABLE_NAME = 'CXC_RUTAS' AND COLUMN_NAME = 'RADIO_KM')
    OR (TABLE_NAME = 'CXC_RUTA_DETALLE' AND COLUMN_NAME = 'HORA_PROGRAMADA');
