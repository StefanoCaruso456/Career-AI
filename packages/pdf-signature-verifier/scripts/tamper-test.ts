/**
 * End-to-end tamper-detection test.
 *
 * 1. Verify an original signed PDF — should be cryptographically valid
 * 2. Flip a single bit inside the signed ByteRange
 * 3. Verify the mutated PDF — MUST return digestValid: false
 *
 * This is the guarantee that justifies the entire package: if we can't
 * catch a 1-bit flip, we can't catch anything.
 */

import { readFile, writeFile } from "node:fs/promises";
import { verifyPdfSignatures } from "../src/index.js";

async function run() {
  const originalPath =
    process.argv[2] ??
    "../../services/document-verifier/test/fixtures/signed.pdf";
  const targetOffset = Number(process.argv[3] ?? "1500");

  const original = await readFile(originalPath);
  const mutated = new Uint8Array(original);
  const before = mutated[targetOffset];
  mutated[targetOffset] ^= 0x01;
  await writeFile("/tmp/tamper-test-output.pdf", mutated);

  console.log(`Original:  ${originalPath} (${original.byteLength} bytes)`);
  console.log(`Mutation:  byte ${targetOffset}: 0x${before.toString(16)} -> 0x${(before ^ 0x01).toString(16)}`);
  console.log();

  const origResult = await verifyPdfSignatures(new Uint8Array(original));
  console.log(`Original:  allValid=${origResult.allValid}`);
  for (const s of origResult.signatures) {
    console.log(`  sig ${s.index}: digestValid=${s.digestValid} signatureValid=${s.signatureValid} cryptographicallyValid=${s.cryptographicallyValid}`);
    if (s.signerSubjectDN) console.log(`    signer: ${s.signerSubjectDN.slice(0, 90)}`);
    if (s.errors.length) console.log(`    errors: ${s.errors.join("; ")}`);
  }

  console.log();
  const mutResult = await verifyPdfSignatures(mutated);
  console.log(`Mutated:   allValid=${mutResult.allValid}`);
  for (const s of mutResult.signatures) {
    console.log(`  sig ${s.index}: digestValid=${s.digestValid} signatureValid=${s.signatureValid} cryptographicallyValid=${s.cryptographicallyValid}`);
    if (s.errors.length) console.log(`    errors: ${s.errors.join("; ")}`);
  }

  console.log();
  const passed = origResult.allValid && !mutResult.allValid;
  console.log(passed ? "✅ TAMPER DETECTION WORKS" : "❌ TAMPER DETECTION FAILED");
  process.exit(passed ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(2);
});
