/**
 * Offer-letter fixture generator.
 *
 * Emits a plausible unsigned offer-letter PDF for smoke-testing the
 * verification pipeline end-to-end. Writes to test/fixtures/ next to the
 * gateway. Run via:
 *
 *   npx tsx scripts/generate-offer-letter-fixture.ts
 *
 * Defaults match the smoke-test curl in the gateway README:
 *   Employer:       Acme Corp
 *   Role:           Senior Engineer
 *   Start date:     2022-03-01
 *   Recipient:      Demo User
 *
 * Override via flags:
 *   --employer "Apple Inc."
 *   --role "Staff Engineer"
 *   --start 2024-06-15
 *   --recipient "Jordan Smith"
 *   --out custom/path.pdf
 *
 * The generated PDF is deliberately unsigned — no DocuSign envelope, no
 * PKCS#7 signature. That's the common case for offer letters users upload
 * (many companies send the PDF as a direct email attachment). The verifier
 * should return PARTIAL with EVIDENCE_SUBMITTED on this file: content
 * matches the claim but there's no trusted-source signal.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

interface Args {
  employer: string;
  role: string;
  start: string; // YYYY-MM-DD
  recipient: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const here = dirname(fileURLToPath(import.meta.url));
  const defaults: Args = {
    employer: "Acme Corp",
    role: "Senior Engineer",
    start: "2022-03-01",
    recipient: "Demo User",
    out: resolve(here, "..", "test", "fixtures", "sample-offer-letter.pdf"),
  };

  const args = { ...defaults };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!flag.startsWith("--") || value === undefined) continue;
    const key = flag.slice(2);
    if (key in defaults) {
      (args as Record<string, string>)[key] = value;
      i++;
    }
  }
  return args;
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthName = months[Math.max(0, Math.min(11, m - 1))] ?? "January";
  return `${monthName} ${d}, ${y}`;
}

function issueDateFromStart(start: string): string {
  // Offer letters typically go out 2-3 weeks before start. For determinism
  // we just subtract 14 days; if it underflows the month we fall back to
  // the first of the start month.
  const [y, m, d] = start.split("-").map(Number);
  const startDate = new Date(Date.UTC(y, m - 1, d));
  startDate.setUTCDate(startDate.getUTCDate() - 14);
  return startDate.toISOString().slice(0, 10);
}

async function generate(args: Args): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const { height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 72;
  const lineHeight = 14;
  let cursorY = height - margin;

  const drawLine = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? 11;
    const font = opts?.bold ? fontBold : fontRegular;
    page.drawText(text, {
      x: margin,
      y: cursorY,
      size,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursorY -= lineHeight;
  };

  const blank = () => {
    cursorY -= lineHeight;
  };

  const paragraph = (text: string, opts?: { size?: number }) => {
    const size = opts?.size ?? 11;
    const maxWidth = 612 - margin * 2;
    const words = text.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const w = fontRegular.widthOfTextAtSize(candidate, size);
      if (w > maxWidth) {
        drawLine(line, { size });
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) drawLine(line, { size });
  };

  const issueDate = formatDateLong(issueDateFromStart(args.start));
  const startDate = formatDateLong(args.start);

  drawLine(args.employer, { bold: true, size: 14 });
  drawLine("123 Business Ave");
  drawLine("Palo Alto, CA 94301");
  blank();
  drawLine(issueDate);
  blank();
  drawLine(`Dear ${args.recipient},`);
  blank();
  paragraph(
    `We are pleased to offer you the position of ${args.role} at ${args.employer}, with a start date of ${startDate}. This offer letter outlines the terms of your employment.`,
  );
  blank();
  paragraph(
    "Your annual base salary will be $180,000, paid bi-weekly in accordance with the company's standard payroll schedule. You will also be eligible for our standard benefits package, including health, dental, and vision insurance; a 401(k) plan with a 4% company match; and 20 days of paid time off per year.",
  );
  blank();
  paragraph("This offer is contingent on:");
  drawLine("    • Satisfactory completion of a standard background check.");
  drawLine("    • Verification of your eligibility to work in the United States.");
  blank();
  paragraph(
    `Your employment with ${args.employer} will be at-will, meaning either party may terminate the relationship at any time, with or without cause or notice. This offer letter is not a contract of employment.`,
  );
  blank();
  paragraph("Please sign below to indicate your acceptance of this offer.");
  blank();
  drawLine("Sincerely,", { bold: false });
  blank();
  drawLine("Jane Smith", { bold: true });
  drawLine(`VP of Engineering, ${args.employer}`);
  blank();
  blank();
  drawLine("_________________________________________          _____________");
  drawLine(`${args.recipient}                                                                                    Date`);
  blank();
  drawLine("_________________________________________          _____________");
  drawLine(`Jane Smith, ${args.employer}                                                            Date`);

  const bytes = await pdfDoc.save();
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, bytes);
  console.log(`[fixture] wrote ${args.out} (${bytes.byteLength} bytes)`);
  console.log(`[fixture] smoke-test this file with:`);
  console.log();
  console.log(
    `  curl -X POST http://localhost:8080/v1/claims/offer-letter \\\n    -H "Authorization: Bearer dev-career-ai-secret-change-me" \\\n    -H "X-Actor-Did: did:web:career-ai:users:demo" \\\n    -F "file=@${args.out}" \\\n    -F 'claim=${JSON.stringify({
      employer: args.employer,
      role: args.role,
      startDate: args.start,
      userAccountName: args.recipient,
    })}'`,
  );
}

generate(parseArgs(process.argv)).catch((err) => {
  console.error("[fixture] failed:", err);
  process.exit(1);
});
