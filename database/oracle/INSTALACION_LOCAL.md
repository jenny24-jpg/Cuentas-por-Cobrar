# Base de datos local de CxC (Oracle 19c / 21c)

Sirve para tener una copia completa y funcional del sistema CxC en tu propia máquina, por si falla el servidor compartido (por ejemplo, el día de una presentación). El sistema funciona igual con una base o con la otra: solo cambian 3 variables de `server/.env`.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `00_instalacion_completa_cxc.sql` | Crea las 39 tablas (con llaves, restricciones e índices) y carga datos de prueba. Un solo archivo. |
| `00_limpiar_esquema_cxc.sql` | Borra las 39 tablas de un esquema local para poder reinstalar. Pide escribir `BORRAR`. |

Los dos son ASCII puro, así que funcionan igual desde SQL Developer o SQL*Plus sin importar la configuración de idioma de Windows.

## Paso 1. Crear un esquema local vacío (una sola vez)

Conéctate como `SYSDBA` (o `SYSTEM`) y ejecuta:

```sql
ALTER SESSION SET CONTAINER = ORCLPDB;        -- solo si tu Oracle es multitenant
CREATE USER CXC_LOCAL IDENTIFIED BY "TuClaveLocal123";
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW TO CXC_LOCAL;
ALTER USER CXC_LOCAL QUOTA UNLIMITED ON USERS;
```

Usa siempre un esquema propio. **No ejecutes el script conectado al esquema del servidor compartido.** Si ya existen tablas de CxC, la instalación se detiene sola con `ORA-20001` sin tocar nada.

### Si tu base conectable `ORCLPDB` está cerrada o en modo restringido

En esta máquina, `ORCLPDB` estaba en estado `MOUNTED` y, al abrirla, queda en **modo restringido** por un error antiguo de sincronización del usuario `NORTHWINDBACKUP` (`ORA-65177`). En ese modo solo entran usuarios con el privilegio `RESTRICTED SESSION`; los demás reciben `ORA-01035`.

```sql
ALTER PLUGGABLE DATABASE ORCLPDB OPEN;                  -- como SYSDBA, en el contenedor raíz
ALTER SESSION SET CONTAINER = ORCLPDB;
GRANT RESTRICTED SESSION TO CXC_LOCAL;                  -- permite entrar mientras siga restringida
```

Para quitar la restricción de raíz hay que resolver ese error de sincronización (se puede ver con `SELECT * FROM pdb_plug_in_violations WHERE status <> 'RESOLVED';`).

## Paso 2. Ejecutar la instalación

- **SQL Developer:** conéctate como `CXC_LOCAL`, abre `00_instalacion_completa_cxc.sql` y pulsa **Ejecutar script (F5)**, no Ctrl+Enter.
- **SQL*Plus:** `sqlplus CXC_LOCAL/TuClaveLocal123@localhost:1521/orclpdb @00_instalacion_completa_cxc.sql`

Al final imprime una verificación: debe mostrar 39 tablas, 0 restricciones deshabilitadas y 0 documentos incoherentes.

## Paso 3. Apuntar el servidor a la base local

En `server/.env` cambia estas tres variables (guarda las del servidor compartido en un archivo aparte para poder volver):

```ini
NODE_ORACLEDB_USER=CXC_LOCAL
NODE_ORACLEDB_PASSWORD=TuClaveLocal123
NODE_ORACLEDB_CONNECTIONSTRING=localhost:1521/orclpdb
```

Luego `pnpm dev`. No hace falta instalar el cliente de Oracle (el sistema usa el modo Thin). Para volver al servidor compartido, restaura esas tres variables.

## Usuarios de prueba

Todos con la contraseña **`Cxc#Demo2026`** (no piden cambiarla al entrar):

| Usuario | Rol | Empleado vinculado |
|---|---|---|
| `admin` | Administrador | Sofía Ramírez (supervisora) |
| `supervisor` | Administrador | Roberto Pineda (segundo aprobador) |
| `operador` | Operador | Ana Lucía Morales (cajera) |
| `cobrador1` | Operador | Luis Fernando García (cobrador, Sucursal Central) |
| `cobrador2` | Operador | Carlos Eduardo Méndez (cobrador, Sucursal Norte) |
| `consulta` | Solo consulta | ninguno |
| `flopez` | Operador | José Fernando López |
| `admin_rescate` | Administrador | ninguno |

`admin` y `supervisor` son dos administradores distintos para poder probar las operaciones que exigen **doble aprobación**.

## Qué datos trae

24 clientes (con NIT válido y código `CLI-#####`), 47 documentos, 28 pagos con sus recibos y aplicaciones, 3 anticipos, 3 notas de crédito, 3 ajustes, 15 documentos con mora, 16 gestiones de cobro, 7 promesas, 2 convenios con cuotas, 8 rutas con 20 paradas, 2 solicitudes de reversa y todos los catálogos. El dashboard muestra una cartera de unos Q209,000 con cerca de la mitad vencida y toda la antigüedad de saldos repartida (corriente, 1-30, 31-60, 61-90 y más de 90 días).

Las fechas son **relativas al día en que ejecutas el script** ("hace 10 días", "dentro de 7 días"), así que siempre se ven recientes y siempre hay documentos vencidos y por vencer. Conviene ejecutarlo el mismo día de la presentación o el anterior.

No trae facturas FEL (se generan desde el sistema), ni sesiones, ni bitácoras: arrancan vacías.

## Volver a empezar

1. Ejecuta `00_limpiar_esquema_cxc.sql` conectado al esquema local y escribe `BORRAR`.
2. Ejecuta `00_instalacion_completa_cxc.sql`.

## Alcance y mantenimiento

- Incluye las tablas de CxC y las que comparte con otros módulos y necesita para funcionar: `EMPLEADO`, `DEPARTAMENTO`, `MONEDA` y `MB_BANCO`. No incluye tablas de Compras, Cuentas por Pagar ni Bancos.
- El DDL se obtuvo del esquema real del servidor el día de generación. Si el equipo agrega migraciones después, hay que regenerar el script para que la copia local no quede atrás.
- La instalación fue probada en un esquema vacío de Oracle 19c: corre sin errores, el servidor arranca contra esa base, los 8 usuarios inician sesión, 50 de 54 endpoints de lectura responden (los otros 4 requieren parámetros) y las altas de cliente, pago, ruta y gestión funcionan.
