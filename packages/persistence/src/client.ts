import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

export type DatabaseQueryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;
export type DatabasePool = Pick<Pool, "query" | "connect" | "end">;

let poolOverride: DatabasePool | null = null;
let databasePool: Pool | null = null;

function isLocalConnectionString(connectionString: string) {
  return (
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1") ||
    connectionString.includes("@db:") ||
    connectionString.includes("@postgres:")
  );
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() ?? "";
}

export function isDatabaseConfigured() {
  return Boolean(poolOverride || getDatabaseUrl());
}

export function requireDatabaseUrl() {
  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for persistent auth and onboarding.");
  }

  return connectionString;
}

export function getDatabasePool(): DatabasePool {
  if (poolOverride) {
    return poolOverride;
  }

  if (!databasePool) {
    const connectionString = requireDatabaseUrl();

    databasePool = new Pool({
      connectionString,
      ssl: isLocalConnectionString(connectionString)
        ? false
        : { rejectUnauthorized: false },
    });
  }

  return databasePool;
}

export function setDatabasePoolForTests(nextPool: DatabasePool | null) {
  poolOverride = nextPool;
}

export async function resetDatabasePool() {
  if (databasePool) {
    await databasePool.end();
    databasePool = null;
  }

  if (poolOverride) {
    await poolOverride.end();
    poolOverride = null;
  }
}

export async function withDatabaseTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
) {
  const pool = getDatabasePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function queryOptional<T extends QueryResultRow>(
  queryable: DatabaseQueryable,
  text: string,
  values: unknown[] = [],
) {
  const result = await queryable.query<T>(text, values);

  return result.rows[0] ?? null;
}

export async function queryRequired<T extends QueryResultRow>(
  queryable: DatabaseQueryable,
  text: string,
  values: unknown[] = [],
) {
  const row = await queryOptional<T>(queryable, text, values);

  if (!row) {
    throw new Error("Expected a database row but none was returned.");
  }

  return row;
}

export async function execute<T extends QueryResultRow>(
  queryable: DatabaseQueryable,
  text: string,
  values: unknown[] = [],
) {
  return queryable.query<T>(text, values);
}

export function getAffectedRowCount(result: QueryResult<QueryResultRow>) {
  return result.rowCount ?? 0;
}
