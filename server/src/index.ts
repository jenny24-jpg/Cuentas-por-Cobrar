import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cxcRoutes from './modules/cxc/routes';
import { errorHandler } from './middlewares';
import { initOraclePool, closeOraclePool } from './config/database';
import { config } from './config';

const app = express();
const PORT = config.port;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de salud básica (Health Check)
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Registro de módulos del sistema
app.use('/api/cxc', cxcRoutes);
// TODO: importar y usar rutas de compras, bancos, cxp

// El manejador de errores va DESPUÉS de las rutas, siempre.
app.use(errorHandler);

async function bootstrap() {
  await initOraclePool();

  const server = app.listen(PORT, () => {
    console.log(`[ERP Server]: API base corriendo en http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    console.log('\n[ERP Server]: Cerrando servidor...');
    server.close();
    await closeOraclePool();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[ERP Server]: Error fatal al iniciar', err);
  process.exit(1);
});
