import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AppEnv } from "../hono-env.js";
import { checkPdfExtractorHealth } from "../verifier/clients/pdf-extractor.js";
import { getVerifierInfo } from "../verifier/index.js";
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

  // pdf-extractor is the only remaining external service dep. The verifier
  // itself runs in-process; if we got here, it loaded.
  const pdfOk = await checkPdfExtractorHealth();
  checks.pdfExtractor = { ok: pdfOk };
  checks.verifier = { ok: true, detail: getVerifierInfo().name };

  const allOk = Object.values(checks).every((c) => c.ok);
  return c.json({ status: allOk ? "ok" : "degraded", checks }, allOk ? 200 : 503);
});
