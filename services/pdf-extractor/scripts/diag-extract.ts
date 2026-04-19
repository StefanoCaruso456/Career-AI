/**
 * Diagnostic script — extract text from a PDF and look for DocuSign markers.
 * Use this to debug why a real DocuSigned PDF isn't matching our parser.
 *
 * Usage: tsx scripts/diag-extract.ts <path-to-pdf>
 */

import { readFile } from "node:fs/promises";
import { extractPdfText } from "../src/extractors/text.js";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx scripts/diag-extract.ts <path-to-pdf>");
    process.exit(1);
  }

  const bytes = await readFile(path);
  const { content: text, pageCount } = await extractPdfText(new Uint8Array(bytes));

  console.log(`=== ${path} ===`);
  console.log(`pages: ${pageCount}`);
  console.log(`text length: ${text.length}`);
  console.log("");

  // Markers we care about
  const markers = [
    { name: "Certificate Of Completion", re: /certificate of completion/i },
    { name: "Envelope Id",               re: /envelope\s*id/i },
    { name: "DocuSign Envelope Id",       re: /docusign\s*envelope\s*id/i },
    { name: "DocuSign brand",             re: /docusign/i },
    { name: "Signer",                     re: /signer/i },
    { name: "Sender",                     re: /sender/i },
    { name: "Signed:",                    re: /\bsigned\s*[:]/i },
    { name: "Completed",                  re: /completed/i },
    { name: "Hashed",                     re: /hash/i },
    { name: "email@domain",               re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  ];

  console.log("--- markers ---");
  for (const m of markers) {
    const match = text.match(m.re);
    if (match) {
      console.log(`  ✓ ${m.name.padEnd(28)} @${match.index}  "${match[0]}"`);
    } else {
      console.log(`  ✗ ${m.name}`);
    }
  }

  // If a marker hit, print surrounding context
  console.log("\n--- text preview (first 1200 chars) ---");
  console.log(text.slice(0, 1200));
  console.log("...");
  console.log("\n--- text preview (last 1500 chars) ---");
  console.log(text.slice(Math.max(0, text.length - 1500)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
