import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AppEnv } from "../hono-env.js";
import { checkDocumentVerifierHealth } from "../clients/document-verifier.js";
import { db } from "../db/index.js";

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get("/", (c) =>
  c.json({ status: "ok", service: "api-gateway", version: "0.1.0" }),
);

healthRoutes.get("/deep", async (c) => {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // DB check
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { ok: true };
  } catch (err) {
    checks.database = { ok: false, detail: String(err) };
  }

  // Document verifier check
  const dvOk = await checkDocumentVerifierHealth();
  checks.documentVerifier = { ok: dvOk };

  const allOk = Object.values(checks).every((c) => c.ok);
  return c.json({ status: allOk ? "ok" : "degraded", checks }, allOk ? 200 : 503);
});
