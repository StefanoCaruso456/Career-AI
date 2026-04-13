type SmsDeliveryResult =
  | {
      messageId: string | null;
      provider: "twilio";
      status: "sent";
    }
  | {
      provider: "twilio";
      reason: string;
      status: "skipped";
    };

function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID?.trim() ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN?.trim() ?? "",
    fromNumber: process.env.TWILIO_FROM_NUMBER?.trim() ?? "",
  };
}

export async function sendAccessRequestSms(args: {
  body: string;
  to: string;
}) {
  const config = getTwilioConfig();

  if (!config.accountSid || !config.authToken || !config.fromNumber) {
    return {
      provider: "twilio",
      reason: "sms_provider_not_configured",
      status: "skipped",
    } satisfies SmsDeliveryResult;
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        Body: args.body,
        From: config.fromNumber,
        To: args.to,
      }).toString(),
    },
  );

  if (!response.ok) {
    throw new Error(`SMS provider returned ${response.status}.`);
  }

  const payload = (await response.json().catch(() => null)) as { sid?: string } | null;

  return {
    messageId: payload?.sid ?? null,
    provider: "twilio",
    status: "sent",
  } satisfies SmsDeliveryResult;
}
