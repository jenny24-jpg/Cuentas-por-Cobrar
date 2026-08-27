// Configuración global de variables de entorno y constantes del backend
export const config = {
  port: process.env.PORT || 3000,
  oracleConnection: {
    user: process.env.NODE_ORACLEDB_USER || '',
    password: process.env.NODE_ORACLEDB_PASSWORD || '',
    connectString: process.env.NODE_ORACLEDB_CONNECTIONSTRING || ''
  }
};
