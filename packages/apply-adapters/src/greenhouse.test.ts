import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplyAdapterContext } from "./types";

const mocks = vi.hoisted(() => ({
  persistApplyRunScreenshot: vi.fn(async () => ({
    artifactType: "screenshot_before_submit",
    contentType: "image/png",
    createdAt: "2026-04-17T12:00:00.000Z",
    id: "artifact_1",
    metadataJson: {},
    runId: "apply_run_123",
    storageKey: "apply_run_123/screenshot.png",
  })),
  stageApplyRunUploadFile: vi.fn(),
  traceApplyTool: vi.fn(async (args: { input: unknown; invoke: (input: unknown) => unknown }) =>
    args.invoke(args.input),
  ),
}));

vi.mock("@/packages/apply-runtime/src/artifacts", () => ({
  persistApplyRunScreenshot: mocks.persistApplyRunScreenshot,
  persistApplyRunTextArtifact: vi.fn(),
}));

vi.mock("@/packages/apply-runtime/src/documents", () => ({
  stageApplyRunUploadFile: mocks.stageApplyRunUploadFile,
}));

vi.mock("@/packages/apply-runtime/src/langsmith", () => ({
  traceApplyTool: mocks.traceApplyTool,
}));

vi.mock("@/packages/apply-domain/src", () => ({
  getAutonomousApplyConfirmationTimeoutMs: vi.fn(() => 5),
  getAutonomousApplyNavigationTimeoutMs: vi.fn(() => 250),
  getAutonomousApplyStepTimeoutMs: vi.fn(() => 250),
  getAutonomousApplySubmitTimeoutMs: vi.fn(() => 250),
}));

import { greenhouseApplyAdapter } from "./greenhouse";

function createFieldHandle(descriptor: {
  id?: string | null;
  label?: string | null;
  name?: string | null;
  required?: boolean;
  tagName?: string;
  type?: string;
  value?: string | null;
}) {
  return {
    boundingBox: vi.fn(async () => ({ x: 0, y: 0, width: 100, height: 20 })),
    evaluate: vi.fn(async () => ({
      dataQa: null,
      id: descriptor.id ?? null,
      label: descriptor.label ?? null,
      name: descriptor.name ?? null,
      required: descriptor.required ?? false,
      tagName: descriptor.tagName ?? "input",
      type: descriptor.type ?? "text",
      value: descriptor.value ?? null,
    })),
  };
}

function createContext(args?: {
  bodyText?: string;
  fieldHandles?: Array<ReturnType<typeof createFieldHandle>>;
  passwordCount?: number;
  url?: string;
}): ApplyAdapterContext {
  const genericInput = {
    check: vi.fn(async () => undefined),
    fill: vi.fn(async () => undefined),
    selectOption: vi.fn(async () => undefined),
    setInputFiles: vi.fn(async () => undefined),
    uncheck: vi.fn(async () => undefined),
  };
  const page = {
    content: vi.fn(async () => "<html></html>"),
    goto: vi.fn(async () => undefined),
    locator: vi.fn((selector: string) => {
      if (selector === "form input:not([type='hidden']), form textarea, form select") {
        return {
          elementHandles: vi.fn(async () => args?.fieldHandles ?? []),
        };
      }

      if (selector.includes("password")) {
        return {
          count: vi.fn(async () => args?.passwordCount ?? 0),
        };
      }

      if (selector.includes("captcha")) {
        return {
          count: vi.fn(async () => 0),
        };
      }

      return {
        count: vi.fn(async () => 0),
        first: vi.fn(() => genericInput),
      };
    }),
    textContent: vi.fn(async () => args?.bodyText ?? ""),
    url: vi.fn(() => args?.url ?? "https://boards.greenhouse.io/example/jobs/123"),
    waitForLoadState: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }),
  };

  return {
    page: page as never,
    run: {
      id: "apply_run_123",
      jobPostingUrl: "https://boards.greenhouse.io/example/jobs/123",
    } as never,
    runnableConfig: {},
    session: {} as never,
    snapshot: {
      documents: {
        resume: {
          artifactId: "artifact_resume_1",
          fileName: "resume.pdf",
          mimeType: "application/pdf",
          parsingStatus: "QUEUED",
          uploadedAt: "2026-04-17T12:00:00.000Z",
        },
      },
      schemaFamily: "greenhouse",
      sourceProfile: {
        email: "candidate@example.com",
        first_name: "Casey",
        last_name: "Candidate",
      },
    } as never,
  };
}

describe("greenhouseApplyAdapter scaffold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stageApplyRunUploadFile.mockResolvedValue("/tmp/resume.pdf");
  });

  it("passes preflight and recognizes a Greenhouse thank-you confirmation", async () => {
    const preflightContext = createContext();
    const confirmContext = createContext({
      bodyText: "Thank you. Your application has been submitted.",
      url: "https://boards.greenhouse.io/example/jobs/123/thank_you",
    });

    await expect(greenhouseApplyAdapter.preflight(preflightContext)).resolves.toBeUndefined();
    await expect(greenhouseApplyAdapter.confirmSubmission(confirmContext)).resolves.toMatchObject({
      confirmed: true,
    });
  });

  it("fails cleanly with LOGIN_REQUIRED when a login wall appears", async () => {
    const context = createContext({
      bodyText: "Sign in to continue",
      passwordCount: 1,
    });

    let failure: unknown = null;

    try {
      await greenhouseApplyAdapter.analyzeForm(context);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeTruthy();
    const classification = await greenhouseApplyAdapter.classifyFailure(context, failure);
    expect(classification.failureCode).toBe("LOGIN_REQUIRED");
  });

  it("fails cleanly with REQUIRED_FIELD_UNMAPPED for unmapped required fields", async () => {
    const context = createContext();

    let failure: unknown = null;

    try {
      await greenhouseApplyAdapter.fillFields(context, {
        entries: [],
        unmappedRequiredFields: [
          {
            fieldType: "text",
            label: "How did you hear about this role?",
            name: "question",
            required: true,
            selector: "input[name='question']",
          },
        ],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeTruthy();
    const classification = await greenhouseApplyAdapter.classifyFailure(context, failure);
    expect(classification.failureCode).toBe("REQUIRED_FIELD_UNMAPPED");
  });

  it("fails closed when a required cover letter upload is visible", async () => {
    const context = createContext({
      fieldHandles: [
        createFieldHandle({
          id: "cover_letter",
          label: "Cover Letter",
          name: "cover_letter",
          required: true,
          tagName: "input",
          type: "file",
        }),
      ],
    });

    await expect(greenhouseApplyAdapter.uploadDocuments(context)).rejects.toThrow(
      "cover letter",
    );
  });
});
