import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DatabasePool } from "./client";
import { getDatabasePool } from "./client";

const DEFAULT_MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");

async function ensureMigrationTable(pool: DatabasePool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

async function getMigrationFiles(directory: string) {
  const files = await fs.readdir(directory);

  return files
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
}

export async function runDatabaseMigrations(options?: {
  directory?: string;
  pool?: DatabasePool;
}) {
  const directory = options?.directory ?? DEFAULT_MIGRATIONS_DIR;
  const pool = options?.pool ?? getDatabasePool();

  await ensureMigrationTable(pool);

  const migrations = await getMigrationFiles(directory);

  for (const migration of migrations) {
    const existing = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [migration],
    );

    if ((existing.rowCount ?? 0) > 0) {
      continue;
    }

    const sql = await fs.readFile(resolve(directory, migration), "utf8");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return migrations;
}

async function runCli() {
  await runDatabaseMigrations();
  console.log("Database migrations are up to date.");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === invokedPath) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
