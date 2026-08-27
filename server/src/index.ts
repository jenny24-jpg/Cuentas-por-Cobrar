import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de salud básica (Health Check)
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Registro de módulos del sistema
// TODO: Importar y usar rutas de compras, bancos, cxp, cxc

app.listen(PORT, () => {
  console.log(`[ERP Server]: API base corriendo en http://localhost:${PORT}`);
});
