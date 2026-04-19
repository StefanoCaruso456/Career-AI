import { createHash } from "node:crypto";

export function sha256Hex(data: Uint8Array | string): string {
  const h = createHash("sha256");
  h.update(data);
  return h.digest("hex");
}

export function sha256Prefixed(data: Uint8Array | string): string {
  return `sha256:${sha256Hex(data)}`;
}
