import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAuditActorTypeForActorIdentity,
  resolveAuthenticatedActorIdentity,
} from "@/actor-identity";
import { auth } from "@/auth";
import type { Persona } from "@/lib/personas";
import { logAuditEvent } from "@/packages/audit-security/src";
import { isDatabaseConfigured, updatePreferredPersona } from "@/packages/persistence/src";

const updatePreferredPersonaInputSchema = z.object({
  persona: z.enum(["job_seeker", "employer"]),
});

export const runtime = "nodejs";

function isServerPersonaPreferenceEnabled() {
  const configuredValue = process.env.PERSIST_SERVER_PERSONA_PREFERENCE?.trim();

  if (configuredValue === "0" || configuredValue === "false") {
    return false;
  }

  return true;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const body = await request.json();
  const payloadResult = updatePreferredPersonaInputSchema.safeParse(body);

  if (!payloadResult.success) {
    return NextResponse.json({ error: "Invalid preferred persona payload." }, { status: 400 });
  }

  const payload = payloadResult.data;
  const actorIdentity = resolveAuthenticatedActorIdentity(session.user);

  if (!actorIdentity?.appUserId) {
    return NextResponse.json(
      { error: "A persistent user identity is required." },
      { status: 409 },
    );
  }

  if (!isServerPersonaPreferenceEnabled() || !isDatabaseConfigured()) {
    return NextResponse.json({
      persisted: false,
      persona: payload.persona,
    });
  }

  const correlationId =
    `preferred_persona_${actorIdentity.appUserId}_${payload.persona}_${crypto.randomUUID()}`;
  const context = await updatePreferredPersona({
    correlationId,
    preferredPersona: payload.persona,
    userId: actorIdentity.appUserId,
  });

  logAuditEvent({
    actorId: actorIdentity.id,
    actorType: getAuditActorTypeForActorIdentity(actorIdentity),
    correlationId,
    eventType: "user.preference.persona.updated",
    metadataJson: {
      preferred_persona: payload.persona,
    },
    targetId: actorIdentity.appUserId,
    targetType: "user",
  });

  return NextResponse.json({
    persisted: true,
    persona: (context.user.preferredPersona ?? payload.persona) as Persona,
  });
}
