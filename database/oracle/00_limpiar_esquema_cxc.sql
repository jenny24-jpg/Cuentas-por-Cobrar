-- =====================================================================================
--  LIMPIAR EL ESQUEMA DE CxC  (elimina las 39 tablas que crea 00_instalacion_completa_cxc.sql)
-- =====================================================================================
--  Sirve para volver a instalar desde cero en un esquema LOCAL de pruebas:
--      1) ejecuta este script    2) ejecuta 00_instalacion_completa_cxc.sql
--
--  ES DESTRUCTIVO: borra las tablas y TODOS sus datos. Por eso pide confirmacion escrita y
--  muestra el esquema donde va a actuar. NO lo ejecutes conectado al esquema del servidor
--  compartido.
-- =====================================================================================

SET DEFINE ON
SET VERIFY OFF
SET FEEDBACK OFF
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

PROMPT =====================================================================
PROMPT  Se eliminaran las tablas de CxC del esquema:
SELECT '  ' || USER || '  @  ' || SYS_CONTEXT('USERENV', 'DB_NAME') AS ESQUEMA FROM DUAL;
PROMPT =====================================================================
ACCEPT confirmar CHAR PROMPT 'Escribe BORRAR (en mayusculas) para continuar: '

DECLARE
  v_confirma VARCHAR2(50) := '&confirmar';
  v_borradas NUMBER := 0;
  TYPE t_lista IS TABLE OF VARCHAR2(40);
  -- orden inverso de dependencias: primero las tablas hijas
  v_tablas t_lista := t_lista(
    'CXC_PROMESAS_PAGO',
    'CXC_GESTIONES_COBRO',
    'CXC_CONVENIO_DOCUMENTOS',
    'CXC_APLICACION_PAGOS',
    'CXC_APLICACION_NOTA_CREDITO',
    'CXC_APLICACION_ANTICIPO',
    'CXC_ANTICIPOS',
    'CXC_AJUSTES',
    'SEG_SESIONES',
    'SEG_RECUPERACION',
    'SEG_BITACORA_ACCION',
    'CXC_SOLICITUDES_REVERSA',
    'CXC_RUTA_DETALLE',
    'CXC_RUTAS',
    'CXC_RECIBOS',
    'CXC_PAGOS',
    'CXC_NOTAS_CREDITO',
    'CXC_MORA',
    'CXC_FACTURA_FEL',
    'CXC_DOCUMENTO_HISTORIAL',
    'CXC_DOCUMENTO_DETALLE',
    'CXC_DOCUMENTOS',
    'CXC_CONVENIO_CUOTAS',
    'CXC_CONVENIOS_PAGO',
    'CXC_CLIENTE_SEGMENTO',
    'CLIENTE',
    'SEG_USUARIOS',
    'SEG_BITACORA_ACCESO',
    'MONEDA',
    'MB_BANCO',
    'EMPLEADO',
    'DEPARTAMENTO',
    'CXC_TRAMOS_MORA',
    'CXC_TIPOS_DOCUMENTO',
    'CXC_SUCURSALES',
    'CXC_SEGMENTOS_CLIENTE',
    'CXC_FORMAS_PAGO',
    'CXC_EMPRESAS',
    'CXC_CONDICIONES_CREDITO'
  );
BEGIN
  v_confirma := UPPER(TRIM(REPLACE(REPLACE(v_confirma, CHR(13)), CHR(10))));   -- tolera espacios y saltos de linea
  IF v_confirma <> 'BORRAR' THEN
    RAISE_APPLICATION_ERROR(-20002, 'Cancelado: no se escribio BORRAR. No se elimino nada.');
  END IF;
  FOR i IN 1 .. v_tablas.COUNT LOOP
    BEGIN
      EXECUTE IMMEDIATE 'DROP TABLE ' || v_tablas(i) || ' CASCADE CONSTRAINTS PURGE';
      v_borradas := v_borradas + 1;
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE <> -942 THEN RAISE; END IF;   -- ORA-00942: la tabla no existe, se ignora
    END;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE('Tablas eliminadas: ' || v_borradas);
END;
/

PROMPT Listo. Ahora puedes ejecutar 00_instalacion_completa_cxc.sql
