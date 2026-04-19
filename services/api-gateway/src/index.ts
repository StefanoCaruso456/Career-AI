import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
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

// Body-size cap on authenticated endpoints. 10 MB comfortably covers offer
// letters + their Certificate of Completion; a bigger payload is almost
// certainly abuse or a mistake. Rejects with 413 before we buffer the body
// into memory, so a malicious client can't OOM the process.
const MAX_BODY_BYTES = 10 * 1024 * 1024;
app.use(
  "/v1/claims/*",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      c.json(
        {
          error: "PAYLOAD_TOO_LARGE",
          message: `Upload exceeds the ${MAX_BODY_BYTES / 1024 / 1024} MB limit.`,
        },
        413,
      ),
  }),
);

// Feature routes.
app.route("/v1/claims", claimsRoutes);

app.onError((err, c) => {
  // Full stack + cause chain stays in server logs only. The client gets a
  // generic message plus the correlation ID so support can find the error
  // without any internal detail leaking over the wire. This closes the path
  // where NODE_ENV-unset deploys would send `String(err)` to callers.
  const correlationId = c.get("correlationId") ?? "unknown";
  console.error(`[api-gateway] unhandled error cid=${correlationId}:`, err);
  return c.json(
    {
      error: "INTERNAL_ERROR",
      message: "Internal error — contact support with the correlation ID.",
      correlationId,
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
