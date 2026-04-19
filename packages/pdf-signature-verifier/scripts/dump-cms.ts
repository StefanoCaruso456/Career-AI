/**
 * Debug: dump the first few bytes of a failing CMS blob + full stack.
 */
import { readFile } from "node:fs/promises";
import { extractSignatures } from "../src/index.js";
import { parseCmsBlob } from "../src/cms.js";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx scripts/dump-cms.ts <pdf>");
    process.exit(1);
  }
  const bytes = await readFile(path);
  const sigs = await extractSignatures(new Uint8Array(bytes));
  console.log(`Found ${sigs.length} signatures`);
  for (const s of sigs) {
    console.log(`\n--- sig ${s.index} ---`);
    console.log(`  filter:     ${s.filter}`);
    console.log(`  subFilter:  ${s.subFilter}`);
    console.log(`  byteRange:  ${s.byteRange.join(", ")}`);
    console.log(`  cmsBytes:   ${s.cmsBytes.byteLength} bytes`);
    console.log(
      `  first 32 bytes: ${Array.from(s.cmsBytes.slice(0, 32))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")}`,
    );
    try {
      const parsed = parseCmsBlob(s.cmsBytes);
      console.log(`  parsed OK. signerSubjectDN: ${parsed.signerSubjectDN}`);
    } catch (err) {
      console.log(`  parse error: ${err instanceof Error ? err.stack : err}`);
    }
  }
}

main().catch(console.error);
