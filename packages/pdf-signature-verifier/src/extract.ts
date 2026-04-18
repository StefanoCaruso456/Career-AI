import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFArray,
  PDFString,
  PDFHexString,
  PDFNumber,
} from "pdf-lib";
import type { ExtractedSignature } from "./types.js";

/**
 * Walk a PDF's indirect objects and return every signature dictionary
 * we can identify, in document order. A signature VALUE dictionary is
 * defined by the presence of both /ByteRange and /Contents; form field
 * entries that merely carry FT=/Sig point to these via /V and are NOT
 * themselves signature dicts.
 *
 * We read the dictionary's /Contents as a PDFHexString (the PKCS#7 blob
 * is typically stored as a hex-encoded stream between angle brackets)
 * and convert to raw bytes. Any trailing zero-pad is trimmed.
 */
export async function extractSignatures(bytes: Uint8Array): Promise<ExtractedSignature[]> {
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const ctx = doc.context;

  const sigs: ExtractedSignature[] = [];
  let index = 0;

  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const byteRangeRaw = obj.lookup(PDFName.of("ByteRange"));
    const contentsRaw = obj.lookup(PDFName.of("Contents"));
    if (!(byteRangeRaw instanceof PDFArray)) continue;
    if (contentsRaw === undefined) continue;

    const byteRange = extractByteRange(byteRangeRaw);
    if (!byteRange) continue;

    const cmsBytes = extractContents(contentsRaw);
    if (!cmsBytes || cmsBytes.byteLength === 0) continue;

    sigs.push({
      index: index++,
      byteRange,
      filter: nameValue(obj.lookup(PDFName.of("Filter"))),
      subFilter: nameValue(obj.lookup(PDFName.of("SubFilter"))),
      reason: stringValue(obj.lookup(PDFName.of("Reason"))),
      location: stringValue(obj.lookup(PDFName.of("Location"))),
      contactInfo: stringValue(obj.lookup(PDFName.of("ContactInfo"))),
      signerName: stringValue(obj.lookup(PDFName.of("Name"))),
      signingTime: stringValue(obj.lookup(PDFName.of("M"))),
      cmsBytes,
    });
  }

  return sigs;
}

function extractByteRange(arr: PDFArray): number[] | undefined {
  const out: number[] = [];
  for (let i = 0; i < arr.size(); i++) {
    const v = arr.get(i);
    if (v instanceof PDFNumber) out.push(v.asNumber());
    else return undefined;
  }
  if (out.length !== 4) return undefined;
  return out;
}

function extractContents(raw: unknown): Uint8Array | undefined {
  if (raw instanceof PDFHexString) {
    const bytes = raw.asBytes();
    // Trim ONLY the zero padding DocuSign adds AFTER the real CMS
    // structure ends. Gotcha: some DocuSign CMS blobs use indefinite-
    // length BER encoding (starts with `30 80`); the structure ends
    // with `00 00` end-of-content markers, and those zeros must NOT
    // be stripped. We walk the outer structure to find where it really
    // ends before touching any trailing zeros.
    return trimTrailingZerosSafely(bytes);
  }
  if (raw instanceof PDFString) {
    // Some producers encode /Contents as a literal string; decode hex chars.
    const txt = raw.asString();
    return hexToBytes(txt.replace(/[^0-9a-fA-F]/g, ""));
  }
  return undefined;
}

function trimTrailingZerosSafely(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength < 2) return bytes;

  // Indefinite-length BER: tag 0x30 (SEQUENCE) + length 0x80.
  if (bytes[0] === 0x30 && bytes[1] === 0x80) {
    const end = findIndefiniteLengthEnd(bytes);
    if (end > 0 && end <= bytes.byteLength) return bytes.slice(0, end);
    return bytes;
  }

  // Definite-length structure — safe to strip all trailing zeros.
  let end = bytes.byteLength;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return bytes.slice(0, end);
}

/**
 * For an indefinite-length BER structure starting with `30 80 ...`,
 * walk forward to find the matching `00 00` end-of-content marker
 * at the outermost level. Returns the byte offset just past the EOC,
 * or -1 if we can't find it.
 *
 * Lightweight walker — tracks nesting depth by watching for any tag
 * that also uses 0x80 length encoding. Good enough for real-world
 * PKCS#7 blobs; not a full ASN.1 parser.
 */
function findIndefiniteLengthEnd(bytes: Uint8Array): number {
  let i = 2; // skip the outer `30 80`
  let depth = 1;

  while (i < bytes.byteLength - 1 && depth > 0) {
    if (bytes[i] === 0x00 && bytes[i + 1] === 0x00) {
      depth--;
      i += 2;
      if (depth === 0) return i;
      continue;
    }

    const tag = bytes[i++];
    if (i >= bytes.byteLength) break;

    // High-tag-number form: low 5 bits all 1.
    if ((tag & 0x1f) === 0x1f) {
      while (i < bytes.byteLength && bytes[i] & 0x80) i++;
      if (i < bytes.byteLength) i++;
    }
    if (i >= bytes.byteLength) break;

    const lenByte = bytes[i++];
    if (lenByte === 0x80) {
      depth++;
      continue;
    }
    if (lenByte < 0x80) {
      i += lenByte;
      continue;
    }
    const lenOctets = lenByte & 0x7f;
    if (lenOctets === 0 || lenOctets > 4) return -1;
    let len = 0;
    for (let k = 0; k < lenOctets && i < bytes.byteLength; k++) {
      len = (len << 8) | bytes[i++];
    }
    i += len;
  }
  return -1;
}

function hexToBytes(hex: string): Uint8Array {
  const len = Math.floor(hex.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function nameValue(v: unknown): string | undefined {
  if (v instanceof PDFName) return v.asString();
  return undefined;
}

function stringValue(v: unknown): string | undefined {
  if (v instanceof PDFString) return v.asString();
  if (v instanceof PDFHexString) return Buffer.from(v.asBytes()).toString("utf8");
  return undefined;
}
