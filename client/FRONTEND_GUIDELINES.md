# 🛡️ DIRECTIVAS FRONTEND & AI RULES — ENTERPRISE ERP

Este documento contiene las reglas obligatorias de arquitectura, diseño y desarrollo frontend para el monorepo. Cualquier código generado por IA o desarrolladores de los módulos (`bancos`, `compras`, `cxc`, `cxp`) debe acatar estas directivas sin excepción.

---

## 1. INMUTABILIDAD DEL CORE (ZONA DE SOLO LECTURA)
- **PROHIBIDO** modificar, renombrar, sobreescribir o eliminar archivos dentro de:
  - `client/src/components/ui/*` (`Button.jsx`, `FormControls.jsx`, `Badges.jsx`, `DataDisplay.jsx`, `AppLayout.jsx`, etc.)
  - `client/src/layouts/*` (`MainLayout.tsx`, `AuthLayout.tsx`)
  - `database/` y `server/` (cuando se trabaje en tareas de interfaz frontend).
- Si un componente necesita una variante o prop adicional, **no se modifica el componente base**. Se compone a partir de los props existentes documentados en `ComponentShowcase.jsx`.

---

## 2. AISLAMIENTO MODULAR POR EQUIPO
- Cada grupo desarrollará exclusivamente dentro de su directorio asignado:
  - **Compras:** `client/src/modules/compras/`
  - **Bancos:** `client/src/modules/bancos/`
  - **Cuentas por Cobrar:** `client/src/modules/cxc/`
  - **Cuentas por Pagar:** `client/src/modules/cxp/`
- Cada módulo debe gestionar sus propias vistas, subcomponentes locales y estado dentro de su carpeta.
- Para registrar nuevas rutas, referenciar los componentes del módulo en `client/src/app/routes.tsx` manteniendo la envoltura en `MainLayout.tsx`.

---

## 3. ESTÁNDAR VISUAL & SISTEMA DE DISEÑO (TAILWIND CSS)

### Paleta Corporativa
- **Azul Primario (Acciones principales):** `bg-blue-600` (`#2563EB`) / Hover: `bg-blue-700`
- **Verde Éxito (Aprobaciones / Acciones positivas):** `bg-emerald-600` (`#059669`)
- **Rojo Peligro (Rechazos / Acciones destructivas):** `bg-red-600` (`#DC2626`)
- **Sidebar / Fondo Shell:** `bg-slate-900` (`#0F172A`)
- **Fondo de Pantalla:** `bg-slate-50` (`#F8FAFC`)
- **Tarjetas / Contenedores:** `bg-white border border-slate-200 shadow-sm rounded-lg`

### Formularios & Controles
- **Inputs & Selects:** Altura obligatoria compacta `h-10` (`px-3 py-2 text-sm border-slate-200 rounded-md`).
- **Campos Obligatorios:** Los labels deben incluir un asterisco en rojo: `<label>Nombre del Campo <span className="text-red-500">*</span></label>`.
- **Botones:** Altura `h-10` o `h-9`. Variantes con soporte de icono Lucide a la izquierda del texto.
- **Modo:** Exclusivamente **Light Mode** en el área de trabajo y tablas. Prohibido aplicar fondos oscuros (`bg-gray-900`, etc.) a los contenedores de datos.

---

## 4. CONVENCIONES DE CÓDIGO & PATRÓN DE VISTA

Toda pantalla nueva de un módulo debe importar los componentes reutilizables desde `@/components/ui` o `../../components/ui`:

```tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput, Select } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badges';
import { StatCard, DataTable } from '@/components/ui/DataDisplay';
import { Plus, Filter } from 'lucide-react';

export const ModuloVistaEjemplo = () => {
  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Título del Módulo</h1>
          <p className="text-sm text-slate-500">Descripción operativa de la vista.</p>
        </div>
        <Button icon="{Plus}" variant="primary">
          Nuevo Registro
        </Button>
      </div>

      {/* Contenido Modular */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
        {/* Tablas / Formularios */}
      </div>
    </div>
  );
};