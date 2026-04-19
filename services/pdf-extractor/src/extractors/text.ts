import { extractText, getDocumentProxy } from "unpdf";
import type { TextExtraction } from "../types.js";

export async function extractPdfText(bytes: Uint8Array): Promise<TextExtraction> {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const content = Array.isArray(text) ? text.join("\n") : text;
  return {
    content,
    pageCount: totalPages,
    length: content.length,
  };
}
