# Arquitectura del ERP Universitario - Monorepo

Este documento describe la arquitectura oficial, la estructura de directorios y la guía de desarrollo para el Monorepo del ERP Universitario.

---

## 1. Enfoque Arquitectónico (Estructura Híbrida)

El ERP Universitario adopta una **Arquitectura Híbrida** diseñada para equilibrar la modularidad física y la cohesión lógica:

1. **Monorepo (Físico - pnpm Workspaces)**: Permite administrar múltiples paquetes independientes (Frontend, Backend, Contratos Compartidos) en un único repositorio Git. Facilita compartir código y tipos de datos en tiempo de desarrollo sin publicar paquetes en un registro NPM externo.
2. **Modularidad por Dominios (Lógico - Clean Architecture)**: El sistema está dividido en cuatro grandes dominios funcionales:
   * **Compras**
   * **Bancos**
   * **Cuentas por Pagar (CXP)**
   * **Cuentas por Cobrar (CXC)**
   
   Esta separación garantiza que el software crezca de forma escalable, reduciendo el acoplamiento y permitiendo a distintos equipos trabajar de manera paralela en dominios específicos.

---

## 2. Mapa del Repositorio

La distribución de archivos y carpetas está organizada de la siguiente manera:

```text
erp-universitario/
├── client/                     # Frontend (React + Vite + TypeScript)
│   ├── src/
│   │   ├── app/                # Rutas y configuración general del sistema
│   │   ├── layouts/            # Estructuras visuales compartidas (Main, Auth)
│   │   ├── modules/            # Módulos de dominio de negocio (Vacíos, listos para programar)
│   │   │   ├── compras/
│   │   │   ├── bancos/
│   │   │   ├── cxp/
│   │   │   └── cxc/
│   │   └── shared/             # Recursos compartidos del cliente (UI, hooks, forms, etc.)
├── server/                     # Backend (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── config/             # Variables de entorno y conexión a bases de datos Oracle
│   │   ├── middlewares/        # Middlewares globales de Express (ej. Manejo de errores)
│   │   ├── modules/            # Estructura lógica por dominios
│   │   │   ├── compras/        # Cada módulo se separa estrictamente en capas:
│   │   │   │   ├── routes/       # Rutas/Endpoints expuestos
│   │   │   │   ├── controllers/  # Orquestadores de petición/respuesta HTTP
│   │   │   │   ├── services/     # Casos de uso y reglas de negocio
│   │   │   │   └── repositories/ # Acceso a datos con Oracle Database
│   │   │   ├── bancos/
│   │   │   ├── cxp/
│   │   │   └── cxc/
│   │   └── shared/             # Utilidades y código transversal del servidor
├── packages/
│   └── contracts/              # Contratos de Datos Compartidos (Types / Interfaces)
│       └── src/
│           ├── modules/        # Contratos agrupados por dominio
│           │   ├── compras/
│           │   ├── bancos/
│           │   ├── cxp/
│           │   └── cxc/
│           └── index.ts        # Punto de exportación de tipos único
├── database/
│   └── oracle/                 # Scripts estructurados para Base de Datos Oracle
│       ├── 01_ddl/             # Tablas, Constraints y Secuencias
│       ├── 02_catalogos/       # Inserts de configuración e información inicial
│       ├── 03_views/           # Vistas SQL
│       ├── 04_packages/        # Procedimientos y Paquetes PL/SQL
│       ├── 05_triggers/        # Disparadores de auditoría y negocio
│       ├── 06_indexes/         # Índices de performance
│       ├── 07_permissions/     # Grants, Roles y Accesos
│       ├── 08_tests/           # Pruebas de base de datos
│       └── install.sql         # Script maestro integrador para SQL*Plus o SQL Developer
├── package.json                # Configuración principal del Monorepo
├── pnpm-workspace.yaml         # Definición de workspaces de pnpm
└── tsconfig.json               # Configuración TypeScript base del monorepo
```

---

## 3. Contratos Compartidos (Single Source of Truth)

Para evitar duplicación y discrepancias de tipado entre el Backend (Express) y el Frontend (React), se implementa el paquete `@erp/contracts`:

* Define todas las interfaces de TypeScript, esquemas de validación y tipos compartidos.
* Tanto `@erp/client` como `@erp/server` consumen este paquete localmente usando la sintaxis `"@erp/contracts": "workspace:*"` en sus archivos `package.json`.
* **Regla Estricta**: No se deben recrear interfaces de red en el cliente o servidor. Cualquier estructura que cruce el límite HTTP debe ser declarada en `@erp/contracts`.

---

## 4. Guía de Comandos (pnpm)

Este monorepo requiere estrictamente la herramienta **pnpm** instalada de manera global (`npm install -g pnpm`).

### 4.1 Instalación de Dependencias
Instalar las dependencias de todos los paquetes y crear los enlaces simbólicos (symlinks) internos del monorepo:
```bash
pnpm install
```

### 4.2 Ejecución de Entornos en Desarrollo
Para ejecutar todos los workspaces configurados en modo de desarrollo en paralelo (Frontend + Backend):
```bash
pnpm dev
```

Ejecutar un paquete específico usando filtros:
```bash
# Iniciar sólo el Frontend
pnpm --filter @erp/client dev

# Iniciar sólo el Backend
pnpm --filter @erp/server dev
```

### 4.3 Compilación (Build)
Compilar todo el proyecto (incluye tipados compartidos, backend y frontend):
```bash
pnpm build
```

### 4.4 Agregar Dependencias

**Dependencias Externas Comunes (Ej: una biblioteca de utilidades en la raíz):**
```bash
pnpm add -w <nombre-paquete>
```

**Dependencias de un Espacio de Trabajo Específico (Ej: agregar `cors` al servidor):**
```bash
pnpm --filter @erp/server add cors
pnpm --filter @erp/server add -D @types/cors
```

---

## 5. Lineamientos para Equipos de Desarrollo

1. **Cascarones Limpios**: El proyecto se entrega sin lógica simulada ni implementaciones dummy. Los equipos de desarrollo deben arrancar el desarrollo escribiendo lógica de negocio real a partir de los puntos de entrada definidos (`src/index.ts`, `src/main.tsx`, `install.sql`).
2. **Independencia de Módulos**: Los submódulos de dominio (`compras`, `bancos`, etc.) no deben realizar importaciones directas cruzadas que rompan sus límites de negocio. Si se requiere interactuar, debe hacerse por medio de servicios del shared o contratos definidos.
3. **Persistencia en Oracle**: Toda consulta SQL u orquestación de datos de base de datos en el servidor Express debe realizarse estrictamente dentro del subdirectorio `repositories` del dominio correspondiente, utilizando el pool de conexiones configurado en `config/database.ts`.
