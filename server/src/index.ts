import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cxcRoutes from './modules/cxc/routes';
import { errorHandler, noStore, securityHeaders } from './middlewares';
import { initOraclePool, closeOraclePool } from './config/database';
import { config } from './config';

const app = express();
const PORT = config.port;

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    // Herramientas locales/server-to-server pueden no enviar Origin.
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Datos financieros: evitar caché de navegador/proxy en toda la API CxC.
app.use('/api/cxc', noStore, cxcRoutes);

app.use(errorHandler);

async function bootstrap() {
  try {
    await initOraclePool();

    const server = app.listen(PORT, () => {
      console.log(`[ERP Server]: API base corriendo en http://localhost:${PORT}`);
    });

    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('\n[ERP Server]: Cerrando servidor...');

      server.close(async () => {
        try {
          await closeOraclePool();
        } finally {
          process.exit(0);
        }
      });
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    console.error('[ERP Server]: Error fatal al iniciar', error);
    process.exit(1);
  }
}

void bootstrap();
