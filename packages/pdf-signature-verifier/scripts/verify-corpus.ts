/**
 * Run verifyPdfSignatures over every PDF in document-verifier's fixture
 * corpus and print a compact summary. Used to validate the verifier
 * against real-world signatures (DocuSign, Adobe Sign, pyHanko, etc.)
 * and to see which fixtures expose edge cases we still need to handle.
 *
 * Usage: tsx scripts/verify-corpus.ts [fixtures-dir]
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, basename, dirname } from "node:path";
import { verifyPdfSignatures } from "../src/index.js";

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, out);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".pdf")) {
      out.push(full);
    }
  }
  return out;
}

function yn(b: boolean): string {
  return b ? "✓" : "·";
}

function trunc(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function main() {
  const rootArg = process.argv[2] ?? "../../services/document-verifier/test/fixtures";
  const rootDir = rootArg.startsWith("/") ? rootArg : join(process.cwd(), rootArg);

  const files = (await walk(rootDir)).sort();
  console.log(`Verifying ${files.length} PDFs under ${rootDir}\n`);

  let totalSigs = 0;
  let totalValid = 0;
  let totalDigestValid = 0;
  let totalSignatureValid = 0;

  const byCat = new Map<string, Array<{ name: string; outcome: Awaited<ReturnType<typeof verifyPdfSignatures>> }>>();

  for (const file of files) {
    const rel = relative(rootDir, file);
    const cat = dirname(rel) === "." ? "(root)" : dirname(rel);
    const name = basename(file);
    const bytes = await readFile(file);
    try {
      const outcome = await verifyPdfSignatures(new Uint8Array(bytes));
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push({ name, outcome });
      totalSigs += outcome.signatureCount;
      for (const s of outcome.signatures) {
        if (s.cryptographicallyValid) totalValid++;
        if (s.digestValid) totalDigestValid++;
        if (s.signatureValid) totalSignatureValid++;
      }
    } catch (err) {
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push({
        name,
        outcome: {
          allValid: false,
          signatureCount: 0,
          signatures: [],
          errors: [err instanceof Error ? err.message : String(err)],
        },
      });
    }
  }

  const header =
    `${"NAME".padEnd(44)} ${"SIG".padStart(3)}  DIG SIG CRY  ${"ALG".padEnd(10)} ${"SUBJECT(trimmed)".padEnd(34)} ${"ERRORS".padEnd(30)}`;

  for (const [cat, rows] of byCat) {
    console.log(`\n=== ${cat} (${rows.length}) ===`);
    console.log(header);
    console.log("-".repeat(header.length));
    for (const { name, outcome } of rows) {
      if (outcome.signatureCount === 0) {
        const err = outcome.errors[0] ?? "(no signatures)";
        console.log(`${trunc(name, 44).padEnd(44)}   0          ${trunc(err, 80)}`);
        continue;
      }
      for (const s of outcome.signatures) {
        const subject = trunc(s.signerSubjectDN, 34);
        const alg = trunc(s.digestAlgorithm, 10);
        const errStr = trunc(s.errors.join("; "), 30);
        console.log(
          `${trunc(name, 44).padEnd(44)} ${String(s.index + 1).padStart(3)}  ${yn(s.digestValid)}   ${yn(s.signatureValid)}   ${yn(s.cryptographicallyValid)}   ${alg.padEnd(10)} ${subject.padEnd(34)} ${errStr}`,
        );
      }
    }
  }

  console.log(`\n=== totals ===`);
  console.log(`  total signatures found : ${totalSigs}`);
  console.log(`  digest valid           : ${totalDigestValid} / ${totalSigs}`);
  console.log(`  signature valid        : ${totalSignatureValid} / ${totalSigs}`);
  console.log(`  fully valid            : ${totalValid} / ${totalSigs}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
