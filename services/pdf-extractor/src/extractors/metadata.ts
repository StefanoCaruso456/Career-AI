import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFArray,
  PDFString,
  PDFHexString,
  PDFRawStream,
} from "pdf-lib";
import type {
  AcroFormExtraction,
  AcroFormField,
  InfoMetadata,
  SignatureDictInfo,
  XmpMetadata,
} from "../types.js";

/**
 * Loads a PDF and extracts /Info, XMP, AcroForm fields, and signature
 * dictionary summaries. Returns everything it can find; any per-field
 * failures get pushed onto the shared `errors` array (passed in by the
 * caller so it can be merged with errors from other extractors).
 */

export interface PdfMetadataBundle {
  info: InfoMetadata;
  xmp?: XmpMetadata;
  acroForm: AcroFormExtraction;
  signatures: SignatureDictInfo[];
}

export async function extractPdfMetadata(
  bytes: Uint8Array,
  errors: string[],
): Promise<PdfMetadataBundle> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
  } catch (err) {
    errors.push(`pdf-lib load: ${err instanceof Error ? err.message : String(err)}`);
    return {
      info: {},
      acroForm: { fieldCount: 0, fields: [] },
      signatures: [],
    };
  }

  const ctx = doc.context;
  const catalog = doc.catalog;

  const info: InfoMetadata = {
    title: doc.getTitle() ?? undefined,
    author: doc.getAuthor() ?? undefined,
    subject: doc.getSubject() ?? undefined,
    keywords: doc.getKeywords() ?? undefined,
    creator: doc.getCreator() ?? undefined,
    producer: doc.getProducer() ?? undefined,
    creationDate: doc.getCreationDate()?.toISOString() ?? undefined,
    modDate: doc.getModificationDate()?.toISOString() ?? undefined,
  };

  let xmp: XmpMetadata | undefined;
  try {
    const metaRef = catalog.get(PDFName.of("Metadata"));
    if (metaRef) {
      const meta = ctx.lookup(metaRef);
      if (meta instanceof PDFRawStream) {
        const raw = Buffer.from(meta.contents).toString("utf8");
        const producerMatch =
          raw.match(/<pdf:Producer>([^<]+)<\/pdf:Producer>/) ??
          raw.match(/pdf:Producer="([^"]+)"/);
        xmp = {
          producer: producerMatch?.[1],
          hasDocuSignNamespace: /<DocuSign:/i.test(raw),
          rawSnippet: raw.slice(0, 2000),
        };
      }
    }
  } catch (err) {
    errors.push(`xmp: ${err instanceof Error ? err.message : String(err)}`);
  }

  const acroForm = extractAcroForm(catalog, ctx, errors);
  const signatures = extractSignatures(ctx, errors);

  return { info, xmp, acroForm, signatures };
}

function extractAcroForm(
  catalog: PDFDict,
  ctx: PDFDocument["context"],
  errors: string[],
): AcroFormExtraction {
  const result: AcroFormExtraction = { fieldCount: 0, fields: [] };
  try {
    const acroForm = catalog.lookup(PDFName.of("AcroForm"));
    if (!(acroForm instanceof PDFDict)) return result;
    const fields = acroForm.lookup(PDFName.of("Fields"));
    if (!(fields instanceof PDFArray)) return result;

    for (let i = 0; i < fields.size(); i++) {
      const fieldRef = fields.get(i);
      const field = ctx.lookup(fieldRef);
      if (!(field instanceof PDFDict)) continue;

      const name = pdfStringValue(field.lookup(PDFName.of("T")));
      const type = pdfNameValue(field.lookup(PDFName.of("FT")));
      const value = pdfStringValue(field.lookup(PDFName.of("V")));

      const entry: AcroFormField = {
        name: name ?? `(unnamed#${i})`,
        type: type ?? undefined,
        value: value ?? undefined,
      };
      result.fields.push(entry);
      if (name && /ENVELOPEID/i.test(name) && !result.envelopeIdFieldName) {
        result.envelopeIdFieldName = name;
      }
    }
    result.fieldCount = result.fields.length;
  } catch (err) {
    errors.push(`acroform: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}

function extractSignatures(
  ctx: PDFDocument["context"],
  errors: string[],
): SignatureDictInfo[] {
  const sigs: SignatureDictInfo[] = [];
  try {
    for (const [, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFDict)) continue;
      const byteRange = obj.lookup(PDFName.of("ByteRange"));
      const contents = obj.lookup(PDFName.of("Contents"));
      // A signature VALUE dict is defined by the ByteRange + Contents pair
      // (the PKCS#7 blob lives in Contents). Form field entries that merely
      // have FT=/Sig point to a signature dict via /V but aren't signature
      // dicts themselves, so we filter them out by requiring ByteRange.
      if (!(byteRange instanceof PDFArray) || contents === undefined) continue;

      const filter = obj.lookup(PDFName.of("Filter"));
      const subFilter = obj.lookup(PDFName.of("SubFilter"));

      sigs.push({
        filter: pdfNameValue(filter),
        subFilter: pdfNameValue(subFilter),
        reason: pdfStringValue(obj.lookup(PDFName.of("Reason"))),
        location: pdfStringValue(obj.lookup(PDFName.of("Location"))),
        contactInfo: pdfStringValue(obj.lookup(PDFName.of("ContactInfo"))),
        name: pdfStringValue(obj.lookup(PDFName.of("Name"))),
        signingTime: pdfStringValue(obj.lookup(PDFName.of("M"))),
        byteRangePresent: true,
      });
    }
  } catch (err) {
    errors.push(`signatures: ${err instanceof Error ? err.message : String(err)}`);
  }
  return sigs;
}

function pdfStringValue(v: unknown): string | undefined {
  if (v instanceof PDFString) return v.asString();
  if (v instanceof PDFHexString) return Buffer.from(v.asBytes()).toString("utf8");
  return undefined;
}

function pdfNameValue(v: unknown): string | undefined {
  if (v instanceof PDFName) return v.asString();
  return undefined;
}
