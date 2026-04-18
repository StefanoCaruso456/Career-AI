import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://career_ledger:career_ledger_dev@localhost:5433/career_ledger",
  },
  strict: true,
  verbose: true,
} satisfies Config;
