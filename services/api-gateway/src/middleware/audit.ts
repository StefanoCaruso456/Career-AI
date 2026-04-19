import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";
import type { AppEnv } from "../hono-env.js";
import { db, schema } from "../db/index.js";

/**
 * Audit every inbound request.
 *
 * Captures method, path, status code, duration, actor DID (if authenticated),
 * and a correlation ID propagated through the request via c.set('correlationId').
 *
 * Intentionally does NOT log request or response bodies. Those are where PII
 * lives, and this table is long-retention. If deep debugging is needed, use
 * structured logs with short retention, not the audit table.
 */
export async function auditRequest(c: Context<AppEnv>, next: Next) {
  const correlationId = c.req.header("x-correlation-id") ?? randomUUID();
  c.set("correlationId", correlationId);
  c.header("x-correlation-id", correlationId);

  const started = Date.now();
  let error: unknown = null;

  try {
    await next();
  } catch (err) {
    error = err;
    throw err;
  } finally {
    const duration = Date.now() - started;
    const status = c.res.status;
    const actor = c.get("actorDid") as string | undefined;

    // Fire-and-forget insert. We don't want audit logging to block the response
    // path. On DB failure we emit the full audit event as a structured log
    // line so a log aggregator can still reconstruct the trail — otherwise a
    // Postgres outage would silently drop the audit record entirely.
    db.insert(schema.auditEvents)
      .values({
        actorDid: actor ?? null,
        method: c.req.method,
        path: c.req.path,
        statusCode: status,
        durationMs: duration,
        correlationId,
      })
      .catch((dbErr) => {
        console.error(
          JSON.stringify({
            level: "error",
            event: "audit_drop",
            reason: dbErr instanceof Error ? dbErr.message : String(dbErr),
            correlationId,
            actorDid: actor ?? null,
            method: c.req.method,
            path: c.req.path,
            statusCode: status,
            durationMs: duration,
          }),
        );
      });

    // Structured log for real-time observability.
    console.log(
      JSON.stringify({
        level: error ? "error" : "info",
        correlationId,
        actorDid: actor,
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs: duration,
        error: error ? String(error) : undefined,
      }),
    );
  }
}
