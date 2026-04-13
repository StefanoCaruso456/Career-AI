import type { AuthenticatedActor } from "@/packages/audit-security/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import { getAccessRequestRecordForNotification, createAccessRequestReviewTokenRecordForChannel, getCandidateNotificationPreferences } from "@/packages/access-request-domain/src";
import { findPersistentContextByTalentIdentityId } from "@/packages/persistence/src";
import {
  buildAccessRequestReviewUrl,
  createAccessRequestReviewToken,
  getAccessRequestReviewTokenExpiry,
} from "@/lib/access-request-review-tokens";
import { sendAccessRequestEmail } from "./email";
import { sendAccessRequestSms } from "./sms";

function isNotificationsEnabled() {
  const configuredValue = process.env.ACCESS_REQUEST_NOTIFICATIONS_ENABLED?.trim().toLowerCase();

  return configuredValue !== "0" && configuredValue !== "false";
}

function isSmsNotificationsEnabled() {
  const configuredValue = process.env.ACCESS_REQUEST_SMS_ENABLED?.trim().toLowerCase();

  return configuredValue !== "0" && configuredValue !== "false";
}

function formatDuration(requestedDurationDaysOptional: number | null) {
  if (!requestedDurationDaysOptional) {
    return "No expiration was requested.";
  }

  return `Requested access duration: ${requestedDurationDaysOptional} day${requestedDurationDaysOptional === 1 ? "" : "s"}.`;
}

function buildEmailBody(args: {
  organizationName: string;
  requestId: string;
  requesterName: string;
  reviewUrl: string;
  scopeLabel: string;
  justification: string;
  requestedDurationDaysOptional: number | null;
}) {
  const durationLine = formatDuration(args.requestedDurationDaysOptional);

  return {
    html: `
      <p>${args.requesterName} from ${args.organizationName} requested access to your Career ID data.</p>
      <p><strong>Scope:</strong> ${args.scopeLabel}</p>
      <p><strong>Reason:</strong> ${args.justification}</p>
      <p>${durationLine}</p>
      <p><a href="${args.reviewUrl}">Review request securely</a></p>
      <p>Request ID: ${args.requestId}</p>
    `,
    subject: `${args.organizationName} requested Career ID access`,
    text: [
      `${args.requesterName} from ${args.organizationName} requested access to your Career ID data.`,
      `Scope: ${args.scopeLabel}`,
      `Reason: ${args.justification}`,
      durationLine,
      `Review securely: ${args.reviewUrl}`,
      `Request ID: ${args.requestId}`,
    ].join("\n"),
  };
}

function buildSmsBody(args: {
  organizationName: string;
  requesterName: string;
  reviewUrl: string;
}) {
  return `${args.requesterName} from ${args.organizationName} requested Career ID access. Review securely: ${args.reviewUrl}`;
}

function logNotificationAudit(args: {
  actor: AuthenticatedActor;
  channel: "email" | "in_app" | "sms";
  correlationId: string;
  eventType: string;
  metadataJson?: Record<string, unknown>;
  requestId: string;
}) {
  logAuditEvent({
    actorId: args.actor.actorId,
    actorType: args.actor.actorType,
    correlationId: args.correlationId,
    eventType: args.eventType,
    metadataJson: {
      channel: args.channel,
      ...(args.metadataJson ?? {}),
    },
    targetId: args.requestId,
    targetType: "access_request",
  });
}

export async function deliverAccessRequestCreatedNotifications(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  requestId: string;
}) {
  if (!isNotificationsEnabled()) {
    return;
  }

  const requestRecord = await getAccessRequestRecordForNotification({
    requestId: args.requestId,
  });

  if (!requestRecord) {
    return;
  }

  const subjectContext = await findPersistentContextByTalentIdentityId({
    correlationId: args.correlationId,
    talentIdentityId: requestRecord.subjectTalentIdentityId,
  });
  const preferences = await getCandidateNotificationPreferences({
    correlationId: args.correlationId,
    talentIdentityId: requestRecord.subjectTalentIdentityId,
  });
  const requestedDurationDaysOptional =
    typeof requestRecord.metadataJson.requested_duration_days === "number"
      ? requestRecord.metadataJson.requested_duration_days
      : null;

  logNotificationAudit({
    actor: args.actor,
    channel: "in_app",
    correlationId: args.correlationId,
    eventType: "access.request.notification.sent",
    requestId: args.requestId,
  });

  const emailToken = createAccessRequestReviewToken();
  const emailUrl = buildAccessRequestReviewUrl({
    requestId: args.requestId,
    token: emailToken,
  });

  if (preferences.accessRequestEmailEnabled && subjectContext.user.email && emailUrl) {
    const expiry = getAccessRequestReviewTokenExpiry();

    await createAccessRequestReviewTokenRecordForChannel({
      accessRequestId: args.requestId,
      channel: "email",
      expiresAt: expiry,
      token: emailToken,
    });

    try {
      const result = await sendAccessRequestEmail({
        ...buildEmailBody({
          justification: requestRecord.justification,
          organizationName: requestRecord.organizationName,
          requestId: args.requestId,
          requestedDurationDaysOptional,
          requesterName: requestRecord.requesterName,
          reviewUrl: emailUrl,
          scopeLabel: requestRecord.scope.replaceAll("_", " "),
        }),
        to: subjectContext.user.email,
      });

      logNotificationAudit({
        actor: args.actor,
        channel: "email",
        correlationId: args.correlationId,
        eventType:
          result.status === "sent"
            ? "access.request.notification.sent"
            : "access.request.notification.skipped",
        metadataJson:
          result.status === "sent"
            ? {
                provider: result.provider,
              }
            : {
                provider: result.provider,
                reason: result.reason,
              },
        requestId: args.requestId,
      });
    } catch (error) {
      logNotificationAudit({
        actor: args.actor,
        channel: "email",
        correlationId: args.correlationId,
        eventType: "access.request.notification.failed",
        metadataJson: {
          reason: error instanceof Error ? error.message : "unknown_email_failure",
        },
        requestId: args.requestId,
      });
    }
  } else {
    logNotificationAudit({
      actor: args.actor,
      channel: "email",
      correlationId: args.correlationId,
      eventType: "access.request.notification.skipped",
      metadataJson: {
        reason: emailUrl ? "email_unavailable" : "review_url_unavailable",
      },
      requestId: args.requestId,
    });
  }

  if (
    isSmsNotificationsEnabled() &&
    preferences.accessRequestSmsEnabled &&
    subjectContext.aggregate.talentIdentity.phone_optional
  ) {
    const smsToken = createAccessRequestReviewToken();
    const smsUrl = buildAccessRequestReviewUrl({
      requestId: args.requestId,
      token: smsToken,
    });

    if (smsUrl) {
      const expiry = getAccessRequestReviewTokenExpiry();

      await createAccessRequestReviewTokenRecordForChannel({
        accessRequestId: args.requestId,
        channel: "sms",
        expiresAt: expiry,
        token: smsToken,
      });

      try {
        const result = await sendAccessRequestSms({
          body: buildSmsBody({
            organizationName: requestRecord.organizationName,
            requesterName: requestRecord.requesterName,
            reviewUrl: smsUrl,
          }),
          to: subjectContext.aggregate.talentIdentity.phone_optional,
        });

        logNotificationAudit({
          actor: args.actor,
          channel: "sms",
          correlationId: args.correlationId,
          eventType:
            result.status === "sent"
              ? "access.request.notification.sent"
              : "access.request.notification.skipped",
          metadataJson:
            result.status === "sent"
              ? {
                  provider: result.provider,
                }
              : {
                  provider: result.provider,
                  reason: result.reason,
                },
          requestId: args.requestId,
        });
      } catch (error) {
        logNotificationAudit({
          actor: args.actor,
          channel: "sms",
          correlationId: args.correlationId,
          eventType: "access.request.notification.failed",
          metadataJson: {
            reason: error instanceof Error ? error.message : "unknown_sms_failure",
          },
          requestId: args.requestId,
        });
      }
    } else {
      logNotificationAudit({
        actor: args.actor,
        channel: "sms",
        correlationId: args.correlationId,
        eventType: "access.request.notification.skipped",
        metadataJson: {
          reason: "review_url_unavailable",
        },
        requestId: args.requestId,
      });
    }
  } else {
    logNotificationAudit({
      actor: args.actor,
      channel: "sms",
      correlationId: args.correlationId,
      eventType: "access.request.notification.skipped",
      metadataJson: {
        reason: preferences.accessRequestSmsEnabled ? "phone_unavailable" : "sms_alerts_disabled",
      },
      requestId: args.requestId,
    });
  }
}
