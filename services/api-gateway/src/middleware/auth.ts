import type { Context, Next } from "hono";
import type { AppEnv } from "../hono-env.js";

/**
 * Shared-secret auth for the demo.
 *
 * Career-AI sends `Authorization: Bearer <GATEWAY_SHARED_SECRET>` on every
 * request. The gateway compares against its env var. If they match, the
 * request proceeds; otherwise 401.
 *
 * This is deliberately the simplest possible auth scheme — real session
 * auth lands when identity-service is wired up. The shape of this middleware
 * stays the same; only the verification logic changes.
 *
 * The secret is read once at module load so rotation requires a restart.
 * That's acceptable for a demo; production would cache via a secrets manager.
 */

const SECRET = process.env.GATEWAY_SHARED_SECRET;

if (!SECRET) {
  console.warn(
    "[api-gateway] GATEWAY_SHARED_SECRET is not set. All requests will be rejected.",
  );
}

export async function requireSharedSecret(c: Context<AppEnv>, next: Next) {
  const header = c.req.header("Authorization");
  if (!header) {
    return c.json({ error: "UNAUTHORIZED", message: "Missing Authorization header" }, 401);
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return c.json(
      { error: "UNAUTHORIZED", message: "Authorization header must be 'Bearer <token>'" },
      401,
    );
  }
  if (!SECRET || match[1] !== SECRET) {
    return c.json({ error: "UNAUTHORIZED", message: "Invalid shared secret" }, 401);
  }

  // Placeholder actor DID until identity-service provides real identities.
  c.set("actorDid", "did:web:career-ledger.example/demo-actor");

  await next();
}
