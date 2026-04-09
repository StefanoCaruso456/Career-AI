import { newDb, type IMemoryDb } from "pg-mem";
import type { DatabasePool } from "./client";
import { resetDatabasePool, setDatabasePoolForTests } from "./client";
import { runDatabaseMigrations } from "./migrations";

export type InstalledTestDatabase = {
  db: IMemoryDb;
  pool: DatabasePool;
};

export async function installTestDatabase(): Promise<InstalledTestDatabase> {
  const db = newDb({
    autoCreateForeignKeyIndices: true,
  });
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool() as unknown as DatabasePool;

  setDatabasePoolForTests(pool);
  await runDatabaseMigrations({ pool });

  return { db, pool };
}

export async function resetTestDatabase() {
  await resetDatabasePool();
}
