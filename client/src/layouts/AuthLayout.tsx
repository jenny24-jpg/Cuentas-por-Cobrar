import React from 'react';

interface AuthLayoutProps {
  children?: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      {/* Estructura para inicio de sesión, recuperación de contraseña, etc. */}
      {children}
    </div>
  );
}
