import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPersonaInquiry } from "./persona";

describe("persona inquiry client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.PERSONA_API_KEY = "persona_sandbox_test";
    process.env.PERSONA_INQUIRY_TEMPLATE_ID = "itmpl_test";
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PERSONA_API_KEY;
    delete process.env.PERSONA_INQUIRY_TEMPLATE_ID;
  });

  it("sends name fields as direct strings when creating an inquiry", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: "inq_123",
          attributes: {
            status: "pending",
          },
        },
      }),
    });

    await createPersonaInquiry({
      correlationId: "persona-inquiry-test",
      firstName: "Stefano",
      lastName: "Caruso",
      referenceId: "career_identity_123",
      source: "career_id_page",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));

    expect(payload.data.attributes.fields).toMatchObject({
      "name-first": "Stefano",
      "name-last": "Caruso",
    });
    expect(payload.data.attributes.fields["name-first"]).toBeTypeOf("string");
    expect(payload.data.attributes.fields["name-last"]).toBeTypeOf("string");
  });
});

