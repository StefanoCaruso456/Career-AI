import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { AppEnv } from "./hono-env.js";
import { requireSharedSecret } from "./middleware/auth.js";
import { auditRequest } from "./middleware/audit.js";
import { claimsRoutes } from "./routes/claims.js";
import { healthRoutes } from "./routes/health.js";
import { getVerifierInfo } from "./verifier/index.js";

const app = new Hono<AppEnv>();

// Global middleware ordering matters: audit wraps everything so we capture
// all requests including auth failures. Auth runs AFTER audit so a bad token
// is still logged.
app.use("*", auditRequest);

// Health endpoints are unauthenticated so docker/k8s probes can hit them.
app.route("/v1/health", healthRoutes);

// Everything else requires the shared secret.
app.use("/v1/*", requireSharedSecret);

// Feature routes.
app.route("/v1/claims", claimsRoutes);

app.onError((err, c) => {
  console.error("[api-gateway] unhandled error:", err);
  return c.json(
    {
      error: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production" ? "Internal error" : String(err),
    },
    500,
  );
});

app.notFound((c) =>
  c.json({ error: "NOT_FOUND", message: `No route for ${c.req.method} ${c.req.path}` }, 404),
);

const port = Number(process.env.PORT ?? 8080);
const hostname = "0.0.0.0";
const verifier = getVerifierInfo();
console.log(`[api-gateway] listening on http://${hostname}:${port}`);
console.log(`[api-gateway] verifier: ${verifier.name} (content extractor: ${verifier.extractor})`);
console.log(`[api-gateway] pdf-extractor at ${process.env.PDF_EXTRACTOR_URL ?? "http://localhost:8788"}`);

serve({ fetch: app.fetch, port, hostname });

export default app;
