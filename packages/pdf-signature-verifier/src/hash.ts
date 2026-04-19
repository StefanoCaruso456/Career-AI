import { webcrypto } from "node:crypto";

/**
 * Hash the bytes covered by a PDF signature's ByteRange.
 *
 * ByteRange = [start1, length1, start2, length2]. The signature covers
 * the concatenation of bytes[start1:start1+length1] and
 * bytes[start2:start2+length2]. The gap in between holds the signature
 * /Contents placeholder itself (by design — the signature cannot cover
 * its own value), which is why two ranges exist.
 *
 * We hash the concatenation with the algorithm specified by the CMS
 * signer. For Career Ledger's use case this is almost always SHA-256.
 */
export async function hashByteRange(
  pdfBytes: Uint8Array,
  byteRange: number[],
  algorithm: "SHA-256" | "SHA-384" | "SHA-512" = "SHA-256",
): Promise<Uint8Array> {
  if (byteRange.length !== 4) {
    throw new Error(`ByteRange must have 4 elements, got ${byteRange.length}`);
  }
  const [start1, length1, start2, length2] = byteRange;

  if (
    start1 < 0 ||
    length1 < 0 ||
    start2 < 0 ||
    length2 < 0 ||
    start1 + length1 > pdfBytes.byteLength ||
    start2 + length2 > pdfBytes.byteLength
  ) {
    throw new Error(
      `ByteRange out of bounds for file of ${pdfBytes.byteLength} bytes: [${byteRange.join(", ")}]`,
    );
  }

  // Concatenate the two ranges into one buffer.
  const combined = new Uint8Array(length1 + length2);
  combined.set(pdfBytes.subarray(start1, start1 + length1), 0);
  combined.set(pdfBytes.subarray(start2, start2 + length2), length1);

  const digest = await webcrypto.subtle.digest(algorithm, combined);
  return new Uint8Array(digest);
}

/**
 * True if the ByteRange covers every byte of the file except the gap
 * containing the signature /Contents placeholder. Incremental updates
 * leave bytes AFTER the ByteRange that are not covered; if the user
 * edits those bytes, the signature still validates — a subtle gotcha.
 */
export function byteRangeCoversWholeFile(
  pdfBytes: Uint8Array,
  byteRange: number[],
): boolean {
  if (byteRange.length !== 4) return false;
  const [start1, length1, start2, length2] = byteRange;
  if (start1 !== 0) return false;
  if (start2 + length2 !== pdfBytes.byteLength) return false;
  // The gap in between (from start1+length1 to start2) holds the signature
  // /Contents placeholder. Any non-zero gap here is expected.
  if (start1 + length1 > start2) return false;
  return true;
}
