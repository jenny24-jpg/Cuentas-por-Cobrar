import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cxcRoutes from './modules/cxc/routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de salud básica (Health Check)
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Registro de módulos del sistema
app.use('/api/cxc', cxcRoutes);
// TODO: cuando estén listos, agregar de la misma forma:
// app.use('/api/compras', comprasRoutes);
// app.use('/api/bancos', bancosRoutes);
// app.use('/api/cxp', cxpRoutes);

app.listen(PORT, () => {
  console.log(`[ERP Server]: API base corriendo en http://localhost:${PORT}`);
});