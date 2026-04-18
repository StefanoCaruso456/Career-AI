type EmailDeliveryResult =
  | {
      messageId: string | null;
      provider: "resend";
      status: "sent";
    }
  | {
      provider: "resend";
      reason: string;
      status: "skipped";
    };

function getResendApiKey() {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

function getEmailFromAddress() {
  return (
    process.env.ACCESS_REQUEST_EMAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    ""
  );
}

export async function sendEmail(args: {
  html: string;
  from?: string;
  subject: string;
  text: string;
  to: string;
}) {
  const apiKey = getResendApiKey();
  const from = args.from?.trim() || getEmailFromAddress();

  if (!apiKey || !from) {
    return {
      provider: "resend",
      reason: "email_provider_not_configured",
      status: "skipped",
    } satisfies EmailDeliveryResult;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      html: args.html,
      subject: args.subject,
      text: args.text,
      to: [args.to],
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}.`);
  }

  const payload = (await response.json().catch(() => null)) as { id?: string } | null;

  return {
    messageId: payload?.id ?? null,
    provider: "resend",
    status: "sent",
  } satisfies EmailDeliveryResult;
}

export async function sendAccessRequestEmail(args: {
  html: string;
  subject: string;
  text: string;
  to: string;
}) {
  return sendEmail(args);
}
