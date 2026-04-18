import { sendEmail } from "@/lib/notifications/email";
import type { ApplyRunDto } from "@/packages/contracts/src";

function getApplyEmailFromAddress() {
  return (
    process.env.AUTONOMOUS_APPLY_EMAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    process.env.ACCESS_REQUEST_EMAIL_FROM?.trim() ||
    ""
  );
}

function getStatusLine(run: ApplyRunDto) {
  if (run.terminalState === "submitted") {
    return "submitted";
  }

  if (run.terminalState === "submission_unconfirmed") {
    return "submission unconfirmed";
  }

  if (run.terminalState === "needs_attention") {
    return "needs attention";
  }

  return "failed";
}

function buildTerminalEmailBody(args: {
  run: ApplyRunDto;
}) {
  const statusLine = getStatusLine(args.run);
  const reason =
    args.run.failureMessage ??
    (args.run.failureCode ? `Reason: ${args.run.failureCode}.` : "No additional detail was captured.");

  return {
    html: `
      <p>Your Career AI autonomous apply run for <strong>${args.run.jobTitle}</strong> at <strong>${args.run.companyName}</strong> is ${statusLine}.</p>
      <p>Status: ${statusLine}</p>
      <p>${reason}</p>
      <p>Run ID: ${args.run.id}</p>
      <p>Completed at: ${args.run.completedAt ?? "in progress"}</p>
    `,
    subject: `Career AI application update: ${args.run.companyName} — ${statusLine}`,
    text: [
      `Your Career AI autonomous apply run for ${args.run.jobTitle} at ${args.run.companyName} is ${statusLine}.`,
      `Status: ${statusLine}`,
      reason,
      `Run ID: ${args.run.id}`,
      `Completed at: ${args.run.completedAt ?? "in progress"}`,
    ].join("\n"),
  };
}

export async function sendApplyRunTerminalEmail(args: {
  run: ApplyRunDto;
  to: string | null | undefined;
}) {
  const recipient = args.to?.trim().toLowerCase();

  if (!recipient) {
    return {
      provider: "resend",
      reason: "missing_recipient",
      status: "skipped",
    } as const;
  }

  return sendEmail({
    ...buildTerminalEmailBody({
      run: args.run,
    }),
    from: getApplyEmailFromAddress(),
    to: recipient,
  });
}
