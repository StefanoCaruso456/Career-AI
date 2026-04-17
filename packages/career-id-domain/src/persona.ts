import { ApiError } from "@/packages/contracts/src";

export type PersonaInquiryResource = {
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
  included?: unknown[];
};

type PersonaCreateInquiryResponse = {
  data?: {
    id?: string;
    attributes?: Record<string, unknown>;
  };
};

type PersonaOneTimeLinkResponse = {
  meta?: {
    "one-time-link"?: string;
  };
};

type PersonaRetrieveInquiryResponse = {
  data?: PersonaInquiryResource;
  included?: unknown[];
};

function getPersonaApiBaseUrl() {
  return process.env.PERSONA_API_BASE_URL?.trim() || "https://api.withpersona.com";
}

export function getPersonaHostedBaseUrl() {
  return process.env.PERSONA_HOSTED_BASE_URL?.trim() || "https://inquiry.withpersona.com/verify";
}

export function getPersonaApiKey() {
  return process.env.PERSONA_API_KEY?.trim() ?? "";
}

export function getPersonaInquiryTemplateId() {
  return process.env.PERSONA_INQUIRY_TEMPLATE_ID?.trim() ?? "";
}

export function getPersonaWebhookSecret() {
  return process.env.PERSONA_WEBHOOK_SECRET?.trim() ?? "";
}

export function isPersonaConfigured() {
  return Boolean(getPersonaApiKey() && getPersonaInquiryTemplateId() && getPersonaWebhookSecret());
}

async function personaRequest<T>(args: {
  path: string;
  method?: string;
  body?: Record<string, unknown>;
  correlationId: string;
}) {
  const apiKey = getPersonaApiKey();

  if (!apiKey) {
    throw new ApiError({
      errorCode: "DEPENDENCY_FAILURE",
      status: 503,
      message: "Persona API credentials are not configured.",
      correlationId: args.correlationId,
    });
  }

  const response = await fetch(`${getPersonaApiBaseUrl()}${args.path}`, {
    method: args.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Persona-Version": "2023-01-05",
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();

    throw new ApiError({
      errorCode: "DEPENDENCY_FAILURE",
      status: 502,
      message: "Persona request failed.",
      details: {
        path: args.path,
        status: response.status,
        body: text.slice(0, 500),
      },
      correlationId: args.correlationId,
    });
  }

  return (await response.json()) as T;
}

export async function createPersonaInquiry(args: {
  correlationId: string;
  firstName?: string | null;
  lastName?: string | null;
  referenceId: string;
  source: string;
}) {
  const templateId = getPersonaInquiryTemplateId();

  if (!templateId) {
    throw new ApiError({
      errorCode: "DEPENDENCY_FAILURE",
      status: 503,
      message: "Persona inquiry template is not configured.",
      correlationId: args.correlationId,
    });
  }

  const fields: Record<string, { value: string }> = {};

  if (args.firstName?.trim()) {
    fields["name-first"] = {
      value: args.firstName.trim(),
    };
  }

  if (args.lastName?.trim()) {
    fields["name-last"] = {
      value: args.lastName.trim(),
    };
  }

  const response = await personaRequest<PersonaCreateInquiryResponse>({
    path: "/api/v1/inquiries",
    method: "POST",
    correlationId: args.correlationId,
    body: {
      data: {
        attributes: {
          "inquiry-template-id": templateId,
          "reference-id": args.referenceId,
          note: args.source,
          ...(Object.keys(fields).length > 0 ? { fields } : {}),
        },
      },
    },
  });

  const inquiryId = response.data?.id?.trim();

  if (!inquiryId) {
    throw new ApiError({
      errorCode: "DEPENDENCY_FAILURE",
      status: 502,
      message: "Persona inquiry creation returned no inquiry ID.",
      correlationId: args.correlationId,
    });
  }

  return {
    inquiryId,
    expiresAt:
      typeof response.data?.attributes?.["expires-at"] === "string"
        ? response.data.attributes["expires-at"]
        : null,
    status:
      typeof response.data?.attributes?.status === "string"
        ? response.data.attributes.status
        : null,
  };
}

export async function retrievePersonaInquiry(args: {
  correlationId: string;
  inquiryId: string;
}) {
  const response = await personaRequest<PersonaRetrieveInquiryResponse>({
    path:
      `/api/v1/inquiries/${encodeURIComponent(args.inquiryId)}` +
      "?include=documents,reports,selfies,verifications",
    correlationId: args.correlationId,
  });

  if (!response.data?.id) {
    throw new ApiError({
      errorCode: "DEPENDENCY_FAILURE",
      status: 502,
      message: "Persona inquiry lookup returned no inquiry payload.",
      correlationId: args.correlationId,
    });
  }

  return {
    ...response.data,
    included: response.included ?? [],
  } as PersonaInquiryResource;
}

export async function generatePersonaOneTimeLink(args: {
  correlationId: string;
  inquiryId: string;
}) {
  const response = await personaRequest<PersonaOneTimeLinkResponse>({
    path: `/api/v1/inquiries/${encodeURIComponent(args.inquiryId)}/generate-one-time-link`,
    method: "POST",
    correlationId: args.correlationId,
    body: {},
  });

  const link = response.meta?.["one-time-link"]?.trim();

  if (!link) {
    throw new ApiError({
      errorCode: "DEPENDENCY_FAILURE",
      status: 502,
      message: "Persona did not return a one-time link.",
      correlationId: args.correlationId,
    });
  }

  return link;
}

export function buildPersonaHostedLaunchUrl(args: {
  inquiryId: string;
  redirectUrl?: string | null;
}) {
  const url = new URL(getPersonaHostedBaseUrl());
  url.searchParams.set("inquiry-id", args.inquiryId);

  if (args.redirectUrl) {
    url.searchParams.set("redirect-uri", args.redirectUrl);
  }

  return url.toString();
}
