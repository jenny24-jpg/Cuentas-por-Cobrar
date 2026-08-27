import React, { useState } from 'react';
import {
  Button,
  TextInput,
  Select,
  TextArea,
  Checkbox,
  StatusBadge,
  AuditBanner,
  Sidebar,
  Navbar,
  AppLayout,
  StatCard,
  ProcessStepper,
  DataTable,
  Pagination
} from './index';

import {
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Download,
  Filter,
  Search,
  User,
  Building,
  Calendar,
  FileText,
  DollarSign,
  Layers,
  CheckCircle2,
  Boxes,
  FileCheck,
  Eye,
  Edit,
  Sparkles,
  LayoutGrid,
  Monitor
} from 'lucide-react';

export const ComponentShowcase = () => {
  // State for interactive showcase controls
  const [viewMode, setViewMode] = useState('catalog'); // 'catalog' | 'full_layout'
  const [activeModule, setActiveModule] = useState('compras');
  const [activeTab, setActiveTab] = useState('registros');
  const [searchQuery, setSearchQuery] = useState('');

  // Interactive Form Controls state
  const [formData, setFormData] = useState({
    docNo: 'SC-2024-0089',
    department: 'Compras',
    date: '2026-08-25',
    responsible: 'María García',
    notes: 'Solicitud urgente para reposición de papelería e insumos de oficina Q3/Q4.',
    urgent: true,
    category: 'Suministros'
  });

  const [formErrors, setFormErrors] = useState({
    responsible: ''
  });

  // Interactive Stepper state
  const [currentStepId, setCurrentStepId] = useState('3way');
  const stepperSteps = [
    { id: 'matriz', title: 'Matriz', count: 9, status: 'completed', icon: Layers },
    { id: 'seleccion', title: 'Selección', count: 5, status: 'completed', icon: CheckCircle2 },
    { id: 'presupuesto', title: 'Presupuesto', count: 0, status: 'active', icon: FileText },
    { id: 'bodega', title: 'Bodega', count: 0, status: 'inactive', icon: Boxes },
    { id: '3way', title: '3-Way Match', count: 10, status: 'completed', icon: FileCheck },
  ];

  // Table Data state
  const [currentPage, setCurrentPage] = useState(1);
  const sampleTableData = [
    { id: 'SOL-2024-001', date: '24 Oct 2023', applicant: 'Carlos Mendoza', department: 'Tecnología', amount: 'Q12,450.00', status: 'aprobado' },
    { id: 'SOL-2024-002', date: '23 Oct 2023', applicant: 'Sofía Rodríguez', department: 'Operaciones', amount: 'Q3,200.00', status: 'pendiente' },
    { id: 'SOL-2024-003', date: '22 Oct 2023', applicant: 'Alejandro Ruiz', department: 'Finanzas', amount: 'Q45,000.00', status: 'revision' },
    { id: 'SOL-2024-004', date: '21 Oct 2023', applicant: 'Valeria Gómez', department: 'Marketing', amount: 'Q1,850.00', status: 'aprobado' },
    { id: 'SOL-2024-005', date: '20 Oct 2023', applicant: 'Mariano Estévez', department: 'Recursos Humanos', amount: 'Q820.00', status: 'rechazado' },
    { id: 'SOL-2024-006', date: '19 Oct 2023', applicant: 'Lucía Fernández', department: 'Legal', amount: 'Q5,100.00', status: 'pendiente' },
  ];

  const tableColumns = [
    {
      header: 'NO. SOLICITUD',
      accessorKey: 'id',
      cell: ({ value }) => <span className="font-bold text-slate-900">{value}</span>
    },
    { header: 'FECHA', accessorKey: 'date' },
    { header: 'SOLICITANTE', accessorKey: 'applicant' },
    { header: 'DEPARTAMENTO', accessorKey: 'department' },
    {
      header: 'MONTO',
      accessorKey: 'amount',
      align: 'right',
      cell: ({ value }) => <span className="font-semibold text-slate-900">{value}</span>
    },
    {
      header: 'ESTADO',
      accessorKey: 'status',
      align: 'center',
      cell: ({ value }) => <StatusBadge status={value} showDot />
    },
    {
      header: 'ACCIONES',
      align: 'center',
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="sm" icon={Eye} onClick={() => alert(`Ver detalle: ${row.id}`)}>
            Ver
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Header Banner & Mode Selector */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-xl text-white shadow-md shadow-blue-500/20">
              E
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight">Enterprise ERP UI Kit</h1>
                <span className="bg-blue-600/30 text-blue-300 border border-blue-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  v1.0 Standard
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Sistema de Diseño compartido: Compras, Bancos, Cuentas por Pagar & Cuentas por Cobrar
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setViewMode('catalog')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'catalog'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid size={15} />
              <span>Catálogo de Componentes</span>
            </button>
            <button
              onClick={() => setViewMode('full_layout')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'full_layout'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor size={15} />
              <span>Vista Previa ERP en Vivo</span>
            </button>
          </div>
        </div>
      </header>

      {/* FULL LAYOUT DEMO MODE */}
      {viewMode === 'full_layout' ? (
        <div className="h-[calc(100vh-73px)]">
          <AppLayout
            activeModule={activeModule}
            onSelectModule={(mod) => setActiveModule(mod)}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab)}
            searchQuery={searchQuery}
            onSearchChange={(q) => setSearchQuery(q)}
          >
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Top Page Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Gestión de Compras</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Módulo de Adquisiciones y Requisiciones de Insumos
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="secondary" icon={Filter} size="md">
                    Filtrar
                  </Button>
                  <Button variant="primary" icon={Plus} size="md">
                    Nueva Solicitud
                  </Button>
                </div>
              </div>

              {/* Stat Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Solicitudes Pendientes"
                  value="24"
                  change="+12.5%"
                  changeLabel="vs. mes anterior"
                  isPositive={true}
                  icon={FileText}
                  onAction={() => alert('Ver solicitudes pendientes')}
                />
                <StatCard
                  title="Órdenes Activas"
                  value="18"
                  change="+8.3%"
                  changeLabel="vs. mes anterior"
                  isPositive={true}
                  icon={CheckCircle}
                />
                <StatCard
                  title="Gastos del Mes"
                  value="Q142,580"
                  change="-4.2%"
                  changeLabel="vs. mes anterior"
                  isPositive={false}
                  icon={DollarSign}
                />
                <StatCard
                  title="Proveedores Activos"
                  value="45"
                  change="+2.4%"
                  changeLabel="vs. mes anterior"
                  isPositive={true}
                  icon={Building}
                />
              </div>

              {/* Process Stepper Component */}
              <ProcessStepper
                steps={stepperSteps}
                currentStepId={currentStepId}
                onStepClick={(step) => setCurrentStepId(step.id)}
                completedRecordsCount={10}
                totalRecordsCount={24}
              />

              {/* Audit Banner */}
              <AuditBanner
                author="Eduardo Ruiz"
                date="25 Oct 2026, 14:30"
                action="Módulo de compras sincronizado por el Director"
              />

              {/* Data Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Solicitudes de Compra Recientes</h3>
                  <span className="text-xs text-slate-500">Mostrando registros activos</span>
                </div>
                <DataTable
                  columns={tableColumns}
                  data={sampleTableData}
                  onRowClick={(row) => alert(`Fila seleccionada: ${row.id}`)}
                  paginationProps={{
                    currentPage: currentPage,
                    totalPages: 4,
                    onPageChange: (p) => setCurrentPage(p),
                    showingText: 'Mostrando 1-6 de 24 registros'
                  }}
                />
              </div>
            </div>
          </AppLayout>
        </div>
      ) : (
        /* CATALOG GALLERY SHOWCASE MODE */
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-12 pb-24">

          {/* Section 1: Buttons */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-6 bg-blue-600 rounded-full" />
                  1. Componente Botón (<code className="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono">Button.jsx</code>)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Soporte nativo para iconos Lucide, altura compacta (<code className="font-mono">h-9 / h-10</code>) y transiciones suaves (<code className="font-mono">transition-colors</code>).
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded-lg">
                src/components/ui/Button.jsx
              </span>
            </div>

            {/* Variants Grid */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Variantes de Color</h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" icon={Plus}>Primary (Azul Eléctrico)</Button>
                <Button variant="success" icon={CheckCircle}>Success (Éxito)</Button>
                <Button variant="danger" icon={Trash2}>Danger (Peligro)</Button>
                <Button variant="secondary" icon={Filter}>Secondary (Borde Slate)</Button>
                <Button variant="ghost" icon={Download}>Ghost (Transparente)</Button>
              </div>
            </div>

            {/* Sizes Grid */}
            <div className="space-y-4 pt-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tamaños (Sizes)</h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" size="sm" icon={Plus}>Pequeño (sm - h-8)</Button>
                <Button variant="primary" size="md" icon={Plus}>Mediano (md - h-9)</Button>
                <Button variant="primary" size="lg" icon={Plus}>Grande (lg - h-11)</Button>
              </div>
            </div>

            {/* Icon Positions & Disabled */}
            <div className="space-y-4 pt-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Posición de Iconos & Estado Deshabilitado</h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" icon={Plus} iconPosition="left">Icono Izquierda</Button>
                <Button variant="secondary" icon={Plus} iconPosition="right">Icono Derecha</Button>
                <Button variant="primary" disabled icon={Plus}>Boton Deshabilitado</Button>
                <Button variant="secondary" disabled>Secundario Deshabilitado</Button>
              </div>
            </div>
          </section>

          {/* Section 2: Form Controls */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-6 bg-blue-600 rounded-full" />
                  2. Controles de Formulario (<code className="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono">FormControls.jsx</code>)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Inputs con altura fija (<code className="font-mono">h-10</code>), asterisco rojo de obligatorio, soporte de icono, estado de solo lectura (como SC-2024-0089) y errores.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded-lg">
                src/components/ui/FormControls.jsx
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* TextInput ReadOnly (SC-2024-0089 style from reference image) */}
              <TextInput
                label="No. Documento"
                value={formData.docNo}
                isReadOnly={true}
                helperText="Generado automáticamente por el sistema ERP"
              />

              {/* TextInput Normal Required with Icon */}
              <TextInput
                label="Responsable"
                required={true}
                icon={User}
                placeholder="Ej. María García"
                value={formData.responsible}
                onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                error={formErrors.responsible}
              />

              {/* TextInput Date */}
              <TextInput
                label="Fecha"
                required={true}
                type="date"
                icon={Calendar}
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />

              {/* Select Dropdown */}
              <Select
                label="Departamento"
                required={true}
                icon={Building}
                options={['Compras', 'Finanzas', 'Tecnología', 'Operaciones', 'Recursos Humanos']}
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              />

              {/* Select Dropdown ReadOnly */}
              <Select
                label="Categoría Solicitud"
                isReadOnly={true}
                options={['Suministros', 'Activos Fijos', 'Servicios']}
                value={formData.category}
              />

              {/* TextInput Error State Demo */}
              <TextInput
                label="Monto Estimado"
                required={true}
                icon={DollarSign}
                placeholder="0.00"
                error="El monto excede el presupuesto asignado para el departamento."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* TextArea */}
              <TextArea
                label="Notas y Observaciones"
                rows={3}
                placeholder="Agregar observaciones o notas adicionales sobre la solicitud de compra..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                helperText="Máximo 500 caracteres"
              />

              {/* Checkbox with HelperText */}
              <div className="flex flex-col justify-center space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <Checkbox
                  label="Excepción de Proveedor Único"
                  checked={formData.urgent}
                  onChange={(e) => setFormData({ ...formData, urgent: e.target.checked })}
                  helperText="Aplica cuando existe un solo proveedor calificado para este bien o servicio específico en la institución."
                />
                <Checkbox
                  label="Requerir aprobación inmediata por Gerencia de Compras"
                  checked={false}
                  helperText="Marque para activar el flujo de validación prioritaria de 24 horas."
                />
              </div>
            </div>
          </section>

          {/* Section 3: Badges & Traces */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-6 bg-blue-600 rounded-full" />
                  3. Badges de Estado y Trazas (<code className="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono">Badges.jsx</code>)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Pills redondeados en colores pastel corporativos con texto seminegrita y banner de auditoría con borde ámbar suave.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded-lg">
                src/components/ui/Badges.jsx
              </span>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">StatusBadge (Pastel Pills)</h3>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Aprobado:</span>
                  <StatusBadge status="aprobado" showDot />
                  <StatusBadge status="aprobada" size="sm" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Pendiente:</span>
                  <StatusBadge status="pendiente" showDot />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">En Revisión:</span>
                  <StatusBadge status="revision" showDot />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Rechazado:</span>
                  <StatusBadge status="rechazado" showDot />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">AuditBanner (Traza de Modificación)</h3>
              <AuditBanner
                author="Eduardo Ruiz"
                date="25 Oct 2026, 14:30 hrs"
                action="Última modificación realizada por"
              />
            </div>
          </section>

          {/* Section 4: Data Display */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-6 bg-blue-600 rounded-full" />
                  4. Visualización de Datos (<code className="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono">DataDisplay.jsx</code>)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Stat Cards con burbujas de iconos, Stepper horizontal interactivo de adquisición y Data Tables con paginación empresarial.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded-lg">
                src/components/ui/DataDisplay.jsx
              </span>
            </div>

            {/* StatCards Demo Grid */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tarjetas Estadísticas (StatCard)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Solicitudes Pendientes"
                  value="24"
                  change="+12.5%"
                  changeLabel="vs. mes anterior"
                  isPositive={true}
                  icon={FileText}
                />
                <StatCard
                  title="Órdenes Activas"
                  value="18"
                  change="+8.3%"
                  changeLabel="vs. mes anterior"
                  isPositive={true}
                  icon={CheckCircle}
                />
                <StatCard
                  title="Gastos del Mes"
                  value="Q142,580"
                  change="-4.2%"
                  changeLabel="vs. mes anterior"
                  isPositive={false}
                  icon={DollarSign}
                />
                <StatCard
                  title="Proveedores Activos"
                  value="45"
                  change="+2.4%"
                  changeLabel="vs. mes anterior"
                  isPositive={true}
                  icon={Building}
                />
              </div>
            </div>

            {/* ProcessStepper Demo */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Barra de Proceso Interactivo (ProcessStepper)</h3>
              <ProcessStepper
                steps={stepperSteps}
                currentStepId={currentStepId}
                onStepClick={(step) => setCurrentStepId(step.id)}
                completedRecordsCount={10}
                totalRecordsCount={24}
              />
            </div>

            {/* DataTable & Pagination Demo */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tabla de Datos con Paginación (DataTable & Pagination)</h3>
              <DataTable
                columns={tableColumns}
                data={sampleTableData}
                onRowClick={(row) => alert(`Clic en fila ${row.id}`)}
                paginationProps={{
                  currentPage: currentPage,
                  totalPages: 4,
                  onPageChange: (p) => setCurrentPage(p),
                  showingText: 'Mostrando 1-6 de 24 registros'
                }}
              />
            </div>
          </section>

          {/* Section 5: Layout Shell Components */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-6 bg-blue-600 rounded-full" />
                  5. Componentes de Estructura / Layout (<code className="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono">AppLayout.jsx</code>)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Sidebar oscuro (<code className="font-mono">bg-slate-900</code>) con perfil en el footer (<code className="font-mono">mt-auto</code>) y Navbar blanco superior con buscador (<code className="font-mono">h-9</code>), campana y pestañas activas.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded-lg">
                src/components/ui/AppLayout.jsx
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm h-96 flex">
              <Sidebar
                activeModule={activeModule}
                onSelectModule={(mod) => setActiveModule(mod)}
                className="h-full"
              />
              <div className="flex-1 flex flex-col bg-slate-50">
                <Navbar
                  activeTab={activeTab}
                  onTabChange={(tab) => setActiveTab(tab)}
                  searchQuery={searchQuery}
                  onSearchChange={(q) => setSearchQuery(q)}
                />
                <div className="p-6 flex flex-col items-center justify-center h-full text-slate-400 text-sm">
                  <Sparkles size={32} className="text-blue-500 mb-2 animate-bounce" />
                  <p className="font-semibold text-slate-700">Contenido principal del módulo ({activeModule.toUpperCase()})</p>
                  <p className="text-xs text-slate-400">Pestaña activa: {activeTab}</p>
                </div>
              </div>
            </div>
          </section>

        </main>
      )}
    </div>
  );
};

export default ComponentShowcase;
