import { webcrypto } from "node:crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

/**
 * One-time pkijs engine setup. pkijs needs to be told which crypto
 * provider to use before any verify/digest call. Node 20+ ships a
 * compliant Web Crypto via `node:crypto`.
 *
 * The tsconfig `lib` is ES2022 (no DOM), so the `Crypto` type pkijs
 * expects isn't exported from globalThis. We cast through unknown.
 */
let engineInitialized = false;
function ensureEngine(): void {
  if (engineInitialized) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cryptoEngine = new pkijs.CryptoEngine({
    name: "node-webcrypto",
    crypto: webcrypto as unknown as any,
  } as any);
  pkijs.setEngine("node-webcrypto", cryptoEngine);
  engineInitialized = true;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Make a fresh ArrayBuffer-backed copy so the type system is happy
  // (Uint8Array.buffer is ArrayBufferLike = ArrayBuffer | SharedArrayBuffer).
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

export interface ParsedCms {
  signedData: pkijs.SignedData;
  signerInfo: pkijs.SignerInfo;
  signerCert?: pkijs.Certificate;
  digestAlgorithm: string;
  signatureAlgorithm: string;
  messageDigest?: Uint8Array;
  signingTime?: string;
  signerSubjectDN?: string;
  signerIssuerDN?: string;
}

/**
 * Parse a raw PKCS#7/CMS SignedData blob from a PDF signature /Contents
 * entry and extract everything we need to run a verification: the
 * SignerInfo, its signed attributes (including message-digest and
 * signing-time), and the signer's certificate.
 *
 * Throws if the blob is not a valid CMS SignedData structure.
 */
export function parseCmsBlob(cmsBytes: Uint8Array): ParsedCms {
  ensureEngine();

  const ab = toArrayBuffer(cmsBytes);
  const asn1 = asn1js.fromBER(ab);
  if (asn1.offset === -1) {
    throw new Error("CMS: failed to parse ASN.1 BER");
  }

  const contentInfo = new pkijs.ContentInfo({ schema: asn1.result });
  const signedData = new pkijs.SignedData({ schema: contentInfo.content });

  if (!signedData.signerInfos || signedData.signerInfos.length === 0) {
    throw new Error("CMS: no signerInfos");
  }
  const signerInfo = signedData.signerInfos[0];

  // Find the signer's certificate by matching issuer + serial number.
  const signerCert = findSignerCert(signedData, signerInfo);

  const digestAlgorithm = oidToDigestName(signerInfo.digestAlgorithm.algorithmId);
  const signatureAlgorithm = signerInfo.signatureAlgorithm.algorithmId;

  // Extract the signed attributes: messageDigest (OID 1.2.840.113549.1.9.4)
  // and signingTime (OID 1.2.840.113549.1.9.5).
  let messageDigest: Uint8Array | undefined;
  let signingTime: string | undefined;
  if (signerInfo.signedAttrs) {
    for (const attr of signerInfo.signedAttrs.attributes) {
      if (attr.type === "1.2.840.113549.1.9.4" && attr.values.length > 0) {
        const valSchema = attr.values[0];
        if (valSchema instanceof asn1js.OctetString) {
          messageDigest = new Uint8Array(valSchema.valueBlock.valueHexView);
        }
      } else if (attr.type === "1.2.840.113549.1.9.5" && attr.values.length > 0) {
        const valSchema = attr.values[0];
        if (valSchema instanceof asn1js.UTCTime || valSchema instanceof asn1js.GeneralizedTime) {
          signingTime = valSchema.toDate().toISOString();
        }
      }
    }
  }

  return {
    signedData,
    signerInfo,
    signerCert,
    digestAlgorithm,
    signatureAlgorithm,
    messageDigest,
    signingTime,
    signerSubjectDN: signerCert ? rdnToString(signerCert.subject) : undefined,
    signerIssuerDN: signerCert ? rdnToString(signerCert.issuer) : undefined,
  };
}

function findSignerCert(
  signedData: pkijs.SignedData,
  signerInfo: pkijs.SignerInfo,
): pkijs.Certificate | undefined {
  if (!signedData.certificates) return undefined;
  const sidAny = signerInfo.sid as unknown as {
    issuer?: pkijs.RelativeDistinguishedNames;
    serialNumber?: asn1js.Integer;
  };
  if (!sidAny.issuer || !sidAny.serialNumber) return undefined;
  const sidIssuer = sidAny.issuer;
  const sidSerial = sidAny.serialNumber;

  for (const certOrAttr of signedData.certificates) {
    if (!(certOrAttr instanceof pkijs.Certificate)) continue;
    if (certOrAttr.issuer.isEqual(sidIssuer)) {
      if (certOrAttr.serialNumber.isEqual(sidSerial)) {
        return certOrAttr;
      }
    }
  }
  return undefined;
}

function oidToDigestName(oid: string): string {
  switch (oid) {
    case "2.16.840.1.101.3.4.2.1":
      return "SHA-256";
    case "2.16.840.1.101.3.4.2.2":
      return "SHA-384";
    case "2.16.840.1.101.3.4.2.3":
      return "SHA-512";
    case "1.3.14.3.2.26":
      return "SHA-1";
    default:
      return oid;
  }
}

function rdnToString(rdn: pkijs.RelativeDistinguishedNames): string {
  const parts: string[] = [];
  for (const typeAndValue of rdn.typesAndValues) {
    const name = oidToAttrName(typeAndValue.type);
    const value = typeAndValue.value.valueBlock.value ?? "";
    parts.push(`${name}=${value}`);
  }
  return parts.join(", ");
}

function oidToAttrName(oid: string): string {
  const map: Record<string, string> = {
    "2.5.4.3": "CN",
    "2.5.4.6": "C",
    "2.5.4.7": "L",
    "2.5.4.8": "ST",
    "2.5.4.10": "O",
    "2.5.4.11": "OU",
    "1.2.840.113549.1.9.1": "E",
  };
  return map[oid] ?? oid;
}

/**
 * Constant-time-ish equality check for two byte arrays. We use this
 * when comparing the message digest embedded in signed attributes
 * against our own SHA-256 of the ByteRange.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
