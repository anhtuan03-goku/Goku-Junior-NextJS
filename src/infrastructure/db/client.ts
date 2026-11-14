import "server-only";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { getEnv, normalizePgConnectionString } from "../config/env";
import * as schema from "./schema";

declare global {
  var __gokuPgPoolV2: Pool | undefined;
}

function createPool(): Pool {
  const { DATABASE_URL_POOLED } = getEnv();
  return new Pool({
    connectionString: normalizePgConnectionString(DATABASE_URL_POOLED),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

const pool = globalThis.__gokuPgPoolV2 ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalThis.__gokuPgPoolV2 = pool;
}

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
export type AppDatabase = typeof db;
