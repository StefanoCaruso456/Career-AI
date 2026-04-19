import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import type { AppEnv } from "../hono-env.js";

/**
 * Shared-secret auth for the demo, plus caller-asserted actor DID.
 *
 * Career-AI sends two headers on every authenticated request:
 *
 *   Authorization: Bearer <GATEWAY_SHARED_SECRET>
 *   X-Actor-Did:   <did of the logged-in user>
 *
 * The shared secret is the trust boundary — only Career-AI has it, so we
 * trust the X-Actor-Did it asserts. When identity-service lands, the
 * Authorization header carries a real signed session token and the actor
 * DID is derived server-side; the X-Actor-Did header goes away. Until then
 * this keeps per-user data correctly partitioned for the demo.
 *
 * The secret is read once at module load so rotation requires a restart.
 * We fail fast at boot when it is unset — a running gateway with no secret
 * would reject every request silently, which is worse than not starting.
 */

const SECRET = process.env.GATEWAY_SHARED_SECRET;

if (!SECRET) {
  throw new Error(
    "[api-gateway] GATEWAY_SHARED_SECRET is required. Set it in the environment before starting the server.",
  );
}

const SECRET_BYTES = Buffer.from(SECRET, "utf8");

function secretsMatch(provided: string): boolean {
  const providedBytes = Buffer.from(provided, "utf8");
  if (providedBytes.length !== SECRET_BYTES.length) return false;
  return timingSafeEqual(providedBytes, SECRET_BYTES);
}

const DID_SHAPE = /^did:[a-z0-9]+:[A-Za-z0-9._\-:/%]+$/;
const MAX_DID_LENGTH = 512;

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
  if (!secretsMatch(match[1])) {
    return c.json({ error: "UNAUTHORIZED", message: "Invalid shared secret" }, 401);
  }

  const actorDid = c.req.header("x-actor-did");
  if (!actorDid) {
    return c.json(
      {
        error: "UNAUTHORIZED",
        message:
          "Missing X-Actor-Did header. Career-AI must assert the logged-in user's DID on every authenticated request.",
      },
      401,
    );
  }
  if (actorDid.length > MAX_DID_LENGTH || !DID_SHAPE.test(actorDid)) {
    return c.json(
      {
        error: "UNAUTHORIZED",
        message: "X-Actor-Did is not a well-formed DID (expected 'did:<method>:<identifier>').",
      },
      401,
    );
  }

  c.set("actorDid", actorDid);

  await next();
}
