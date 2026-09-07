import oracledb from 'oracledb';
import { config } from './index';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = false;

let pool: oracledb.Pool | null = null;

export async function initOraclePool(): Promise<oracledb.Pool> {
  if (pool) return pool;

  const { user, password, connectString } = config.oracleConnection;

  if (!user || !password || !connectString) {
    throw new Error(
      '[Oracle] Faltan variables de conexión. Revisa server/.env'
    );
  }

  console.log(`[Oracle] Conectando como ${user} a ${connectString}...`);

  pool = await oracledb.createPool({
    user,
    password,
    connectString,
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 1,
    poolTimeout: 60,
  });

  console.log('[Oracle] Pool de conexiones inicializado');

  return pool;
}

export async function getConnection(): Promise<oracledb.Connection> {
  if (!pool) {
    throw new Error(
      'El pool de Oracle no está inicializado. Debe ejecutarse initOraclePool() al iniciar el servidor.'
    );
  }

  return pool.getConnection();
}

export async function closeOraclePool(): Promise<void> {
  if (pool) {
    await pool.close(10);
    pool = null;

    console.log('[Oracle] Pool de conexiones cerrado');
  }
}