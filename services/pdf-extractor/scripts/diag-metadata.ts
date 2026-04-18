/**
 * Diagnostic: dump all sender-adjacent metadata from a PDF.
 *
 * Reports:
 *   - /Info dictionary fields (Title, Author, Subject, Creator, Producer, dates)
 *   - /ID (document ID array)
 *   - XMP metadata stream (raw excerpt — XMP often carries sender email/name)
 *   - Signature dictionaries: /Name, /Reason, /Location, /ContactInfo
 *   - Form field names and values
 *   - Embedded file names (DocuSign sometimes stores the original as an attachment)
 *
 * Use this to answer "can we get the sender identity without the Certificate
 * of Completion?" for real fixtures.
 */

import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString, PDFStream, PDFRawStream } from "pdf-lib";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx scripts/diag-metadata.ts <path-to-pdf>");
    process.exit(1);
  }

  const bytes = await readFile(path);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });

  console.log(`=== ${path} ===\n`);

  // 1. /Info dictionary
  console.log("--- /Info dictionary ---");
  console.log(`  Title:        ${doc.getTitle() ?? "(none)"}`);
  console.log(`  Author:       ${doc.getAuthor() ?? "(none)"}`);
  console.log(`  Subject:      ${doc.getSubject() ?? "(none)"}`);
  console.log(`  Keywords:     ${doc.getKeywords() ?? "(none)"}`);
  console.log(`  Creator:      ${doc.getCreator() ?? "(none)"}`);
  console.log(`  Producer:     ${doc.getProducer() ?? "(none)"}`);
  console.log(`  CreationDate: ${doc.getCreationDate()?.toISOString() ?? "(none)"}`);
  console.log(`  ModDate:      ${doc.getModificationDate()?.toISOString() ?? "(none)"}`);

  // 2. /ID
  const ctx = doc.context;
  const trailerInfo = ctx.trailerInfo;
  const id = trailerInfo.ID;
  if (id instanceof PDFArray) {
    console.log("\n--- /ID ---");
    for (let i = 0; i < id.size(); i++) {
      const entry = id.get(i);
      if (entry instanceof PDFHexString) {
        console.log(`  [${i}]: ${Buffer.from(entry.asBytes().subarray(0, 16)).toString("hex")}...`);
      } else {
        console.log(`  [${i}]: ${String(entry)}`);
      }
    }
  }

  // 3. XMP metadata (catalog /Metadata stream)
  const catalog = doc.catalog;
  const metaRef = catalog.get(PDFName.of("Metadata"));
  if (metaRef) {
    const meta = ctx.lookup(metaRef);
    if (meta instanceof PDFStream) {
      const rawBytes = meta instanceof PDFRawStream ? meta.contents : null;
      if (rawBytes) {
        const text = Buffer.from(rawBytes).toString("utf8");
        console.log("\n--- XMP metadata (first 2000 chars) ---");
        console.log(text.slice(0, 2000));
      }
    }
  }

  // 4. AcroForm fields — if the doc has form fields, their names/values
  try {
    const form = doc.getForm();
    const fields = form.getFields();
    if (fields.length > 0) {
      console.log("\n--- Form fields ---");
      for (const f of fields) {
        const name = f.getName();
        let value = "(not text)";
        try {
          if ("getText" in f && typeof (f as any).getText === "function") {
            value = (f as any).getText() ?? "(empty)";
          }
        } catch {
          // ignore
        }
        console.log(`  ${name.padEnd(40)} = ${value}`);
      }
    }
  } catch (err) {
    console.log(`\n--- Form fields: ${String(err)} ---`);
  }

  // 5. AcroForm dict direct inspection (signature annotations live here)
  const acroForm = catalog.lookup(PDFName.of("AcroForm"));
  if (acroForm instanceof PDFDict) {
    const formFields = acroForm.lookup(PDFName.of("Fields"));
    if (formFields instanceof PDFArray) {
      console.log("\n--- AcroForm raw field inspection ---");
      for (let i = 0; i < formFields.size(); i++) {
        const ref = formFields.get(i);
        const field = ctx.lookup(ref);
        if (field instanceof PDFDict) {
          inspectField(field, i);
        }
      }
    }
  }

  // 6. Signature /Sig dictionaries — look for /Name, /Reason, /Location, /ContactInfo
  console.log("\n--- Signature dict scan ---");
  let foundSigs = 0;
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict) {
      const type = obj.lookup(PDFName.of("Type"));
      const ft = obj.lookup(PDFName.of("FT"));
      const filter = obj.lookup(PDFName.of("Filter"));
      const subFilter = obj.lookup(PDFName.of("SubFilter"));
      const isSig =
        (type instanceof PDFName && type.asString() === "/Sig") ||
        (filter instanceof PDFName && /Adobe\.PPKLite|ETSI\.CAdES|DocuSign/.test(filter.asString())) ||
        (ft instanceof PDFName && ft.asString() === "/Sig");
      if (isSig || subFilter) {
        foundSigs++;
        console.log(`  Signature object #${foundSigs}`);
        for (const key of ["Name", "Reason", "Location", "ContactInfo", "M", "SubFilter", "Filter", "CertsEmail"]) {
          const v = obj.lookup(PDFName.of(key));
          if (v) {
            console.log(`    /${key}: ${formatPdfValue(v)}`);
          }
        }
      }
    }
  }
  if (foundSigs === 0) {
    console.log("  (no signature dictionaries found)");
  }

  // 7. Embedded files
  const names = catalog.lookup(PDFName.of("Names"));
  if (names instanceof PDFDict) {
    const ef = names.lookup(PDFName.of("EmbeddedFiles"));
    if (ef) {
      console.log("\n--- Embedded files: present (not dumped) ---");
    }
  }
}

function inspectField(field: PDFDict, idx: number) {
  const name = field.lookup(PDFName.of("T"));
  const ft = field.lookup(PDFName.of("FT"));
  const value = field.lookup(PDFName.of("V"));
  console.log(`  [${idx}] name=${formatPdfValue(name)} type=${formatPdfValue(ft)} value=${formatPdfValue(value)?.slice?.(0, 120) ?? formatPdfValue(value)}`);
}

function formatPdfValue(v: any): string {
  if (v === undefined || v === null) return "(none)";
  if (v instanceof PDFString) return `"${v.asString()}"`;
  if (v instanceof PDFHexString) return `<hex ${Buffer.from(v.asBytes().subarray(0, 32)).toString("hex")}...>`;
  if (v instanceof PDFName) return v.asString();
  if (v instanceof PDFDict) return "<dict>";
  if (v instanceof PDFArray) return `<array len=${v.size()}>`;
  return String(v);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
