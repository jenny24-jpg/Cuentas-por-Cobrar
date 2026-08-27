import React from 'react';

interface MainLayoutProps {
  children?: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="main-layout">
      {/* Estructura común: Sidebar, Header, Content Area */}
      {children}
    </div>
  );
}
