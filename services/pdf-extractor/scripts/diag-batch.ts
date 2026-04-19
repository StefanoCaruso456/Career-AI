/**
 * Batch diagnostic: walk test/fixtures/ recursively, inspect every PDF,
 * and print a compact summary table.
 *
 * For each file we report:
 *   - Source folder (category)
 *   - Filename
 *   - Size, pages, text length
 *   - Whether DocuSign envelope ID is in page text
 *   - Whether an AcroForm ENVELOPEID_ field is present
 *   - Whether a Certificate of Completion heading is in the text
 *   - Whether the XMP metadata contains <DocuSign:TrackingInformation>
 *   - The XMP Producer string (when present)
 *   - /Info Author field
 *   - Signature dictionary count
 *   - Signature /Filter and /SubFilter (identifies the signing provider)
 *   - Structural tampering flag (envelope text present but sig dict missing)
 *
 * Usage: tsx scripts/diag-batch.ts [fixtures-dir]
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, basename, dirname } from "node:path";
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFArray,
  PDFString,
  PDFHexString,
  PDFRawStream,
} from "pdf-lib";
import { extractPdfText } from "../src/extractors/text.js";

interface Row {
  category: string;
  name: string;
  sizeKb: number;
  pages: number;
  textLen: number;
  envelopeInText: boolean;
  envelopeId?: string;
  envelopeFormField: boolean;
  cocHeading: boolean;
  xmpDocusign: boolean;
  xmpProducer?: string;
  infoAuthor?: string;
  sigDictCount: number;
  sigFilter?: string;
  sigSubFilter?: string;
  sigReason?: string;
  structuralTamper: boolean;
  error?: string;
}

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

async function inspect(path: string, rootDir: string): Promise<Row> {
  const rel = relative(rootDir, path);
  const parent = dirname(rel);
  const category = parent === "." ? "(root)" : parent;
  const name = basename(path);
  const st = await stat(path);
  const sizeKb = Math.round(st.size / 1024);

  try {
    const bytes = await readFile(path);
    const { content: text, pageCount } = await extractPdfText(new Uint8Array(bytes));

    const envelopeInText = /(?:docu\s*sign\s*)?envelope\s*id/i.test(text);
    const envelopeIdMatch = text.match(/envelope\s*id\s*[:\-]?\s*([0-9A-Fa-f-]{20,})/i);
    const envelopeId = envelopeIdMatch?.[1];
    const cocHeading = /certificate of completion/i.test(text);

    const doc = await PDFDocument.load(new Uint8Array(bytes), {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const ctx = doc.context;
    const catalog = doc.catalog;

    // XMP metadata
    let xmpDocusign = false;
    let xmpProducer: string | undefined;
    const metaRef = catalog.get(PDFName.of("Metadata"));
    if (metaRef) {
      const meta = ctx.lookup(metaRef);
      if (meta instanceof PDFRawStream) {
        const xmp = Buffer.from(meta.contents).toString("utf8");
        xmpDocusign = /<DocuSign:/i.test(xmp);
        const producerMatch =
          xmp.match(/<pdf:Producer>([^<]+)<\/pdf:Producer>/) ??
          xmp.match(/pdf:Producer="([^"]+)"/);
        if (producerMatch) xmpProducer = producerMatch[1];
      }
    }

    const infoAuthor = doc.getAuthor();

    // AcroForm ENVELOPEID_ field
    let envelopeFormField = false;
    const acroForm = catalog.lookup(PDFName.of("AcroForm"));
    if (acroForm instanceof PDFDict) {
      const fields = acroForm.lookup(PDFName.of("Fields"));
      if (fields instanceof PDFArray) {
        for (let i = 0; i < fields.size(); i++) {
          const fieldRef = fields.get(i);
          const field = ctx.lookup(fieldRef);
          if (field instanceof PDFDict) {
            const tRaw = field.lookup(PDFName.of("T"));
            let tStr: string | undefined;
            if (tRaw instanceof PDFString) tStr = tRaw.asString();
            else if (tRaw instanceof PDFHexString) tStr = Buffer.from(tRaw.asBytes()).toString("utf8");
            if (tStr && /ENVELOPEID/i.test(tStr)) {
              envelopeFormField = true;
              break;
            }
          }
        }
      }
    }

    // Signature dict scan
    let sigDictCount = 0;
    let sigFilter: string | undefined;
    let sigSubFilter: string | undefined;
    let sigReason: string | undefined;
    for (const [, obj] of ctx.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict) {
        const type = obj.lookup(PDFName.of("Type"));
        const ft = obj.lookup(PDFName.of("FT"));
        const filter = obj.lookup(PDFName.of("Filter"));
        const subFilter = obj.lookup(PDFName.of("SubFilter"));
        const byteRange = obj.lookup(PDFName.of("ByteRange"));
        const isSig =
          (type instanceof PDFName && type.asString() === "/Sig") ||
          (ft instanceof PDFName && ft.asString() === "/Sig") ||
          (byteRange instanceof PDFArray &&
            filter instanceof PDFName &&
            subFilter instanceof PDFName);
        if (isSig) {
          sigDictCount++;
          if (!sigFilter && filter instanceof PDFName) sigFilter = filter.asString();
          if (!sigSubFilter && subFilter instanceof PDFName) sigSubFilter = subFilter.asString();
          if (!sigReason) {
            const reason = obj.lookup(PDFName.of("Reason"));
            if (reason instanceof PDFString) sigReason = reason.asString();
            else if (reason instanceof PDFHexString) sigReason = Buffer.from(reason.asBytes()).toString("utf8");
          }
        }
      }
    }

    const structuralTamper =
      envelopeInText && sigDictCount === 0 && !xmpDocusign && !envelopeFormField;

    return {
      category,
      name,
      sizeKb,
      pages: pageCount,
      textLen: text.length,
      envelopeInText,
      envelopeId,
      envelopeFormField,
      cocHeading,
      xmpDocusign,
      xmpProducer,
      infoAuthor: infoAuthor ?? undefined,
      sigDictCount,
      sigFilter,
      sigSubFilter,
      sigReason,
      structuralTamper,
    };
  } catch (err) {
    return {
      category,
      name,
      sizeKb,
      pages: 0,
      textLen: 0,
      envelopeInText: false,
      envelopeFormField: false,
      cocHeading: false,
      xmpDocusign: false,
      sigDictCount: 0,
      structuralTamper: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function yn(b: boolean): string {
  return b ? "✓" : "·";
}

function trunc(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function main() {
  const rootArg = process.argv[2] ?? "test/fixtures";
  const rootDir = rootArg.startsWith("/") ? rootArg : join(process.cwd(), rootArg);

  const files = (await walk(rootDir)).sort();
  console.log(`Inspecting ${files.length} PDFs under ${rootDir}\n`);

  const rows: Row[] = [];
  for (const f of files) {
    try {
      rows.push(await inspect(f, rootDir));
    } catch (err) {
      console.error(`  FAIL ${f}: ${err}`);
    }
  }

  // Group by category for readability
  const byCat = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push(r);
  }

  const header =
    `${"NAME".padEnd(42)} ${"SIZE".padStart(6)} ${"PG".padStart(3)}  ` +
    `TXT EFF COC XMP SIG  ${"FILTER".padEnd(14)} ${"SUBFILTER".padEnd(22)} ${"AUTHOR".padEnd(14)} ${"PRODUCER(XMP)".padEnd(30)} TAMP`;

  for (const [cat, rs] of byCat) {
    console.log(`\n=== ${cat} (${rs.length}) ===`);
    console.log(header);
    console.log("-".repeat(header.length));
    for (const r of rs) {
      if (r.error) {
        console.log(`${r.name.padEnd(42)} ERROR: ${r.error}`);
        continue;
      }
      const line =
        `${trunc(r.name, 42).padEnd(42)} ${String(r.sizeKb + "k").padStart(6)} ${String(r.pages).padStart(3)}  ` +
        `${yn(r.envelopeInText)}   ${yn(r.envelopeFormField)}   ${yn(r.cocHeading)}   ${yn(r.xmpDocusign)}   ${String(r.sigDictCount).padStart(1)}    ` +
        `${trunc(r.sigFilter, 14).padEnd(14)} ${trunc(r.sigSubFilter, 22).padEnd(22)} ${trunc(r.infoAuthor, 14).padEnd(14)} ${trunc(r.xmpProducer, 30).padEnd(30)} ${yn(r.structuralTamper)}`;
      console.log(line);
    }
  }

  // Aggregate counts
  console.log("\n=== totals ===");
  const total = rows.length;
  const docusign = rows.filter((r) => r.envelopeInText || r.envelopeFormField || r.xmpDocusign).length;
  const hasSigDict = rows.filter((r) => r.sigDictCount > 0).length;
  const hasCoc = rows.filter((r) => r.cocHeading).length;
  const xmpDs = rows.filter((r) => r.xmpDocusign).length;
  const tampered = rows.filter((r) => r.structuralTamper).length;
  console.log(`  total files            : ${total}`);
  console.log(`  any DocuSign marker    : ${docusign}`);
  console.log(`  has signature dict     : ${hasSigDict}`);
  console.log(`  has CoC page heading   : ${hasCoc}`);
  console.log(`  has <DocuSign:> in XMP : ${xmpDs}`);
  console.log(`  structural-tamper flag : ${tampered}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
