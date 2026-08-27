import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileSpreadsheet,
  Coins,
  Landmark,
  Search,
  Bell,
  ChevronRight,
  LogOut
} from 'lucide-react';

/**
 * Sidebar Navigation Component for Enterprise ERP
 */
export const Sidebar = ({
  activeModule = 'compras',
  onSelectModule,
  user = {
    name: 'Eduardo Ruiz',
    role: 'Director de Compras',
    initials: 'ER'
  },
  className = ''
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'compras', label: 'Compras', icon: ShoppingCart },
    { id: 'inventario', label: 'Inventario', icon: Package },
    { id: 'cuentas_pagar', label: 'Cuentas por Pagar', icon: FileSpreadsheet },
    { id: 'cuentas_cobrar', label: 'Cuentas por Cobrar', icon: Coins },
    { id: 'bancos', label: 'Bancos', icon: Landmark },
  ];

  return (
    <aside className={`w-64 bg-slate-900 text-slate-300 flex flex-col h-screen shrink-0 border-r border-slate-800 select-none ${className}`}>
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800/80">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-blue-600/30 text-lg">
          E
        </div>
        <span className="font-bold text-white text-lg tracking-tight">
          System
        </span>
      </div>

      {/* Main Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectModule && onSelectModule(item.id)}
              className={`
                w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group
                ${isActive 
                  ? 'bg-slate-800 text-white font-semibold shadow-sm border border-slate-700/50' 
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'}
              `}
            >
              <Icon 
                size={18} 
                className={`transition-colors duration-150 ${isActive ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-200'}`} 
              />
              <span className="truncate flex-1 text-left">{item.label}</span>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
              )}
            </button>
          );
        })}
      </nav>

      {/* User Profile Footer (mt-auto) */}
      <div className="mt-auto p-4 border-t border-slate-800 bg-slate-900/90">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/50 hover:bg-slate-800 transition-colors cursor-pointer group">
          <div className="w-9 h-9 rounded-full bg-slate-700 text-slate-200 font-semibold flex items-center justify-center text-xs border border-slate-600 shrink-0">
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate leading-tight group-hover:text-blue-400 transition-colors">
              {user.name}
            </p>
            <p className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
              {user.role}
            </p>
          </div>
          <LogOut size={16} className="text-slate-500 hover:text-red-400 transition-colors shrink-0" title="Cerrar sesión" />
        </div>
      </div>
    </aside>
  );
};

/**
 * Top Navbar Component with search, notification bell and horizontal tabs
 */
export const Navbar = ({
  activeTab = 'registros',
  onTabChange,
  searchQuery = '',
  onSearchChange,
  tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'registros', label: 'Registros' },
  ],
  title = '',
  className = ''
}) => {
  return (
    <header className={`bg-white border-b border-slate-200 px-6 flex items-center justify-between h-16 shrink-0 ${className}`}>
      {/* Left side: Navigation tabs or Page Title */}
      <div className="flex items-center gap-8 h-full">
        {tabs && tabs.length > 0 && (
          <nav className="flex items-center gap-6 h-full">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange && onTabChange(tab.id)}
                  className={`
                    h-full flex items-center px-1 text-sm transition-all duration-150 border-b-2 font-medium relative top-[1px]
                    ${isActive 
                      ? 'border-blue-600 text-blue-600 font-semibold' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'}
                  `}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        )}

        {title && !tabs.length && (
          <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        )}
      </div>

      {/* Right side: Search bar & Notifications */}
      <div className="flex items-center gap-4">
        <div className="relative flex items-center">
          <Search size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar solicitud..."
            value={searchQuery}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            className="h-9 w-64 pl-9 pr-4 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all duration-150"
          />
        </div>

        <button 
          className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
          title="Notificaciones"
        >
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
        </button>
      </div>
    </header>
  );
};

/**
 * AppLayout Wrapper Component
 */
export const AppLayout = ({
  activeModule = 'compras',
  activeTab = 'registros',
  onSelectModule,
  onTabChange,
  searchQuery,
  onSearchChange,
  tabs,
  user,
  children
}) => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      <Sidebar 
        activeModule={activeModule} 
        onSelectModule={onSelectModule} 
        user={user} 
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar 
          activeTab={activeTab} 
          onTabChange={onTabChange}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          tabs={tabs}
        />
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
};
