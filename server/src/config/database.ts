// Configuración de conexión y pool de la base de datos Oracle
import oracledb from 'oracledb';
import { config } from './index';

// oracledb corre en modo Thin por defecto desde v6+: no requiere Oracle
// Instant Client instalado en la máquina ni en el contenedor de despliegue.
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = false; // control explícito de commit/rollback en cada repositorio

let pool: oracledb.Pool | null = null;

/**
 * Inicializa el pool de conexiones. Debe llamarse UNA vez al arrancar el
 * servidor (ver src/index.ts), nunca dentro de un repositorio individual.
 */
export async function initOraclePool(): Promise<oracledb.Pool> {
  if (pool) return pool;

  pool = await oracledb.createPool({
    user: config.oracleConnection.user,
    password: config.oracleConnection.password,
    connectString: config.oracleConnection.connectString,
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 1,
    poolTimeout: 60,
  });

  console.log('[Oracle] Pool de conexiones inicializado');
  return pool;
}

/**
 * Obtiene una conexión del pool. Úsalo dentro de un try/finally y SIEMPRE
 * cierra la conexión (conn.close()) para devolverla al pool — nunca la
 * mantengas abierta entre requests.
 */
export async function getConnection(): Promise<oracledb.Connection> {
  if (!pool) {
    throw new Error(
      'El pool de Oracle no está inicializado. Verifica que initOraclePool() se llamó en el bootstrap del servidor (src/index.ts).',
    );
  }
  return pool.getConnection();
}

/** Cierra el pool. Llamar en el shutdown del servidor (SIGINT/SIGTERM). */
export async function closeOraclePool(): Promise<void> {
  if (pool) {
    await pool.close(10);
    pool = null;
    console.log('[Oracle] Pool de conexiones cerrado');
  }
}
