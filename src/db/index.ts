/**
 * Punto de entrada de la base de datos.
 *
 * Crea el cliente Drizzle sobre Neon Postgres usando el driver `postgres-js`.
 * El `db` y todo el schema (tablas + tipos inferidos) se re-exportan desde
 * aquí, de modo que el resto de la app importa siempre desde `@/db`.
 *
 * Nota: `prepare: false` desactiva los prepared statements, requerido por el
 * pooler de Neon (modo transaction) para evitar errores de statements cacheados.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/** Cadena de conexión a Neon; debe estar definida en el entorno. */
const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, { prepare: false });

/** Cliente Drizzle tipado con el schema completo. Importar como `import { db } from '@/db'`. */
export const db = drizzle(client, { schema });
export * from './schema';
