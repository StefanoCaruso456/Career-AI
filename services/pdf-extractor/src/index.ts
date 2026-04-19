import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { extractPdf } from "./extractors/index.js";

const VERSION = "0.1.0";
const SERVICE_NAME = `pdf-extractor@${VERSION}`;

const app = new Hono();

app.get("/v1/health", (c) =>
  c.json({ status: "ok", service: "pdf-extractor", version: VERSION }),
);

app.post("/v1/extract", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json(
      { error: "INVALID_REQUEST", message: "Expected multipart/form-data body." },
      400,
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json(
      { error: "INVALID_REQUEST", message: "Missing 'file' field (expected a PDF upload)." },
      400,
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  if (buffer.byteLength === 0) {
    return c.json({ error: "INVALID_REQUEST", message: "Uploaded file is empty." }, 400);
  }

  try {
    const result = await extractPdf(buffer);
    return c.json({ service: SERVICE_NAME, ...result });
  } catch (err) {
    console.error("[pdf-extractor] extraction failed:", err);
    return c.json(
      {
        error: "EXTRACTION_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
      422,
    );
  }
});

app.onError((err, c) => {
  console.error("[pdf-extractor] unhandled error:", err);
  return c.json({ error: "INTERNAL_ERROR", message: String(err) }, 500);
});

const port = Number(process.env.PORT ?? 8788);
const hostname = "0.0.0.0";
console.log(`[pdf-extractor] listening on http://${hostname}:${port}`);

serve({ fetch: app.fetch, port, hostname });

export default app;
