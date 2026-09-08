// Configuración de conexión y pool de la base de datos Oracle
import oracledb from 'oracledb';
import { config } from './index';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let pool: oracledb.Pool | null = null;

async function getPool(): Promise<oracledb.Pool> {
  if (!pool) {
    pool = await oracledb.createPool({
      user: config.oracleConnection.user,
      password: config.oracleConnection.password,
      connectString: config.oracleConnection.connectString,
    });
  }
  return pool;
}

export async function getConnection(): Promise<oracledb.Connection> {
  const activePool = await getPool();
  return activePool.getConnection();
}