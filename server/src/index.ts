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

// Ruta de salud básica
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
  });
});

// Rutas del módulo Cuentas por Cobrar
app.use('/api/cxc', cxcRoutes);
// TODO: cuando estén listos, agregar de la misma forma:
// app.use('/api/compras', comprasRoutes);
// app.use('/api/bancos', bancosRoutes);
// app.use('/api/cxp', cxpRoutes);

// Manejo de errores
app.use(errorHandler);

async function bootstrap() {
  try {
    await initOraclePool();

    const server = app.listen(PORT, () => {
      console.log(
        `[ERP Server]: API base corriendo en http://localhost:${PORT}`,
      );
    });

    const shutdown = async () => {
      console.log('\n[ERP Server]: Cerrando servidor...');

      server.close(async () => {
        await closeOraclePool();
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('[ERP Server]: Error fatal al iniciar', error);
    process.exit(1);
  }
}

void bootstrap();