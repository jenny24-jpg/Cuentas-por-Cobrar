# Revisión del núcleo financiero CxC — versión pre-DDL

## Objetivo

Esta versión aplica las reglas de negocio confirmadas para Cuentas por Cobrar sin asumir todavía constraints, triggers, secuencias o packages Oracle que aún no han sido compartidos.

## Implementado

### Documentos
- El saldo ya no se recibe desde el formulario: al crear un documento inicia igual al total.
- El estado inicia en `PENDIENTE` y se deriva del saldo (`PENDIENTE`, `PARCIAL`, `PAGADO`).
- El vencimiento se expone como condición independiente `VIGENTE` / `VENCIDA`, permitiendo mostrar por ejemplo `PARCIAL` + `VENCIDA` sin inventar estados combinados.
- Un documento pagado/anulado no se edita desde el CRUD.
- Cuando un documento ya tiene movimientos financieros, se bloquea la edición directa de cabecera.
- La eliminación física queda restringida a documentos sin movimientos y pendientes. Los demás deben pasar por un flujo de anulación cuando la BD/auditoría esté definida.

### Aplicación de pagos
- Registrar un pago NO modifica el saldo de una factura.
- Aplicar un pago sí modifica el saldo y estado del documento.
- La operación bloquea (`FOR UPDATE`) el pago y el documento para evitar sobreaplicaciones concurrentes.
- Valida mismo cliente, saldo pendiente, disponible real del pago y estados terminales.
- Inserción de aplicación + actualización de saldo + actualización de estado del pago + `COMMIT` ocurren en una sola transacción.
- El selector muestra únicamente pagos con monto disponible y documentos abiertos del mismo cliente.
- La UI limita el monto al menor valor entre disponible del pago y saldo del documento.
- Las aplicaciones confirmadas se tratan como inmutables desde el CRUD: no se editan ni eliminan. La reversa se implementará cuando se confirme el modelo de auditoría/BD.

### Notas de crédito
- Crear una NC NO reduce el saldo de la factura.
- La NC reduce el saldo únicamente al aplicarse.
- La aplicación bloquea (`FOR UPDATE`) NC y documento.
- Valida mismo cliente, saldo pendiente, disponible de la NC y estados terminales.
- Aplicación + saldo de documento + estado del documento + estado de NC se actualizan en una sola transacción.
- La NC pasa a `APLICADA` al consumirse completamente; mientras tenga disponible permanece `PENDIENTE`.
- La UI muestra monto aplicado/disponible y limita la aplicación al menor disponible entre NC y documento.
- Las aplicaciones confirmadas no se editan ni eliminan; requieren futura reversa.

### Pagos
- Se separó el registro del pago de su aplicación.
- Estados de registro/operación preparados: `NO_IDENTIFICADO`, `NO_APLICADO`, `EN_CUENTA`, `APLICADO`, `REVERSADO`, `ANULADO`.
- Se muestra monto total, aplicado y disponible.
- Un pago con aplicaciones ya no puede modificarse ni borrarse físicamente desde el CRUD.

### Ajustes
- Se normalizaron tipos a `DEBITO` / `CREDITO`.
- Motivo obligatorio (mínimo 10 caracteres), monto/fecha/cliente/documento validados.
- Un ajuste crédito no puede superar el saldo del documento.
- Por seguridad, registrar un ajuste todavía NO mueve el saldo: falta confirmar en Oracle cómo se persistirán `PENDIENTE/APROBADO/RECHAZADO/ANULADO`, aprobador y autorización. El efecto financiero debe ocurrir solo al aprobarse.

### Convenios
- Se bloquea la creación si el cliente no tiene al menos una promesa `INCUMPLIDA` o una mora `ACTIVA` asociada a un documento con saldo.
- Se conserva la generación exacta del plan de cuotas, incluyendo distribución de centavos.

### UI/UX y firmeza
- Estados visuales unificados mediante un componente común.
- Formularios financieros muestran disponibles/saldos y explican cuándo una operación impacta cartera.
- Se corrigieron usos incompatibles con ES2020 (`replaceAll`) y el tipado de iconos Lucide.
- Se mantienen validaciones frontend y backend: el navegador no es la fuente de verdad.

## Pendiente al recibir DDL / modelo Oracle

1. Implementar reversa formal de aplicaciones de pago y NC con trazabilidad (quién, cuándo, motivo).
2. Anulación formal de pagos, NC y documentos sin `DELETE` físico una vez confirmados.
3. Ajustes con estado, aprobador y doble aprobación; únicamente `APROBADO` debe impactar saldo.
4. Historial de documento automático y append-only. Actualmente existe la tabla/CRUD heredado, pero falta identidad/autorización consistente para generar eventos en todas las operaciones.
5. Recibo derivado automáticamente de pago aplicado, con numeración propia y reglas FEL/SAT.
6. Confirmar constraints/checks reales para normalizar estados heredados (`ACTIVO`, `VENCIDO`, etc.) sin romper datos existentes.
7. Confirmar si la aplicación/reversa debe registrar asiento o movimiento contable adicional.
8. Convertir creación de Convenio + Cuotas a una única transacción Oracle si el modelo permite compartir conexión/repositorio.
9. Índices, FKs, unicidad de documentos, precisión `NUMBER`, secuencias/identity y triggers.

## Criterios de aceptación cubiertos parcialmente

- Factura Q1,000 + pago aplicado Q400 => saldo Q600, `PARCIAL`.
- Saldo Q600 + NC aplicada Q100 => saldo Q500, `PARCIAL`.
- Fecha vencida con saldo > 0 => condición `VENCIDA` adicional al estado financiero.
- Aplicación > saldo => rechazada.
- Aplicación > disponible del pago/NC => rechazada.
- Dos aplicaciones concurrentes sobre el mismo pago/documento quedan serializadas mediante `FOR UPDATE`.

La reversa del caso de pago mal aplicado queda intencionalmente pendiente hasta definir la estructura de auditoría/anulación en Oracle; en esta versión se bloquea editar/eliminar una aplicación confirmada para evitar corrupción de saldo.

## Validación técnica realizada en esta revisión

- `packages/contracts`: TypeScript sin errores.
- `client`: TypeScript sin errores en el entorno de validación.
- `server`: TypeScript sin errores en el entorno de validación.
- 204 archivos TS/TSX analizados sintácticamente: 0 errores de parseo.
- 454 imports relativos verificados: 0 rutas faltantes.
- 0 marcadores de conflicto Git.
- `server/.env` conservado para ejecución local, según la instrucción del proyecto.

> Nota: no se pudo ejecutar el empaquetado final de Vite dentro del contenedor porque los `node_modules` del ZIP provienen de una instalación PNPM de Windows y sus enlaces internos no son portables al entorno Linux. En el equipo local se debe ejecutar `pnpm install` y luego `pnpm build` para la comprobación final del bundle.
