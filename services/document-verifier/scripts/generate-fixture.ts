/**
 * Generates a synthetic offer letter PDF for local testing.
 *
 * Produces test/fixtures/sample-offer-letter.pdf — a text-only PDF whose
 * content exercises the heuristic content extractor. It does NOT include
 * a DocuSign certificate or a cryptographic signature, so authenticity
 * will come back as "unsigned" and the verdict will be PARTIAL at best.
 * That's the expected baseline for unsigned documents.
 *
 * For testing the DocuSign path, drop a real DocuSigned PDF into
 * test/fixtures/ and run curl against the service with it.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function generate() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const lines: Array<{ text: string; f?: typeof font; size?: number }> = [
    { text: "ACME CORP", f: bold, size: 18 },
    { text: "123 Main Street, Springfield, USA", size: 10 },
    { text: "" },
    { text: "" },
    { text: "March 1, 2022", size: 11 },
    { text: "" },
    { text: "Dear Candidate,", size: 11 },
    { text: "" },
    {
      text: "We are pleased to offer you the position of Senior Engineer at Acme Corp",
      size: 11,
    },
    {
      text: "starting on March 1, 2022. This letter confirms the terms of your employment.",
      size: 11,
    },
    { text: "" },
    {
      text: "Your starting role will be Senior Engineer reporting to the VP of",
      size: 11,
    },
    { text: "Engineering. Start date: 2022-03-01.", size: 11 },
    { text: "" },
    { text: "Welcome to the team.", size: 11 },
    { text: "" },
    { text: "Sincerely,", size: 11 },
    { text: "The Acme Corp Hiring Team", size: 11 },
  ];

  let y = 750;
  for (const line of lines) {
    const chosenFont = line.f ?? font;
    const size = line.size ?? 11;
    page.drawText(line.text, {
      x: 72,
      y,
      size,
      font: chosenFont,
      color: rgb(0, 0, 0),
    });
    y -= size + 6;
  }

  const bytes = await doc.save({ useObjectStreams: false });
  const outPath = resolve(process.cwd(), "test/fixtures/sample-offer-letter.pdf");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);

  console.log(`Wrote ${outPath} (${bytes.byteLength} bytes)`);
  console.log("\nTry it:");
  console.log(
    `curl -X POST http://localhost:8787/v1/verify \\\n  -F "file=@${outPath}" \\\n  -F 'claim={"employer":"Acme Corp","role":"Senior Engineer","startDate":"2022-03-01"}'`,
  );
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
