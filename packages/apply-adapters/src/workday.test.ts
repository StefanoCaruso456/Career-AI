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
    storageKey: "/tmp/screenshot.png",
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

import { workdayApplyAdapter } from "./workday";

function createContext(args?: {
  bodyText?: string;
  buttonLabels?: string[];
  captchaCount?: number;
  fileInputCount?: number;
  passwordCount?: number;
  setInputFilesError?: Error;
  url?: string;
  waitForLoadStateError?: Error;
}): ApplyAdapterContext {
  const buttons = (args?.buttonLabels ?? []).map((label) => ({
    click: vi.fn(async () => undefined),
    innerText: vi.fn(async () => label),
    textContent: vi.fn(async () => label),
  }));
  const fileInput = {
    setInputFiles: vi.fn(async () => {
      if (args?.setInputFilesError) {
        throw args.setInputFilesError;
      }
    }),
  };
  const page = {
    content: vi.fn(async () => "<html></html>"),
    goto: vi.fn(async () => undefined),
    locator: vi.fn((selector: string) => {
      if (selector === "button, [role='button'], input[type='submit']") {
        return {
          count: vi.fn(async () => buttons.length),
          nth: vi.fn((index: number) => buttons[index]),
        };
      }

      if (selector === "input[type='file']") {
        return {
          count: vi.fn(async () => args?.fileInputCount ?? 0),
          first: vi.fn(() => fileInput),
        };
      }

      if (selector.includes("password")) {
        return {
          count: vi.fn(async () => args?.passwordCount ?? 0),
        };
      }

      if (selector.includes("captcha")) {
        return {
          count: vi.fn(async () => args?.captchaCount ?? 0),
        };
      }

      if (selector === "input, textarea, select") {
        return {
          elementHandles: vi.fn(async () => []),
        };
      }

      return {
        count: vi.fn(async () => 0),
        first: vi.fn(() => ({
          check: vi.fn(async () => undefined),
          fill: vi.fn(async () => undefined),
          selectOption: vi.fn(async () => undefined),
          uncheck: vi.fn(async () => undefined),
        })),
      };
    }),
    textContent: vi.fn(async () => args?.bodyText ?? ""),
    url: vi.fn(() => args?.url ?? "https://example.myworkdayjobs.com/recruiting/example/job/123"),
    waitForLoadState: vi.fn(async () => {
      if (args?.waitForLoadStateError) {
        throw args.waitForLoadStateError;
      }
    }),
    waitForTimeout: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }),
  };

  return {
    page: page as never,
    run: {
      id: "apply_run_123",
      jobPostingUrl: "https://example.myworkdayjobs.com/recruiting/example/job/123",
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
      schemaFamily: "workday",
      sourceProfile: {},
    } as never,
  };
}

describe("workdayApplyAdapter hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stageApplyRunUploadFile.mockResolvedValue("/tmp/resume.pdf");
  });

  it("succeeds on a valid preflight and confirmation marker happy path", async () => {
    const preflightContext = createContext();
    const confirmContext = createContext({
      bodyText: "Thank you for applying. Your application was received.",
      url: "https://example.myworkdayjobs.com/recruiting/submission/complete",
    });

    await expect(workdayApplyAdapter.preflight(preflightContext)).resolves.toBeUndefined();
    await expect(workdayApplyAdapter.confirmSubmission(confirmContext)).resolves.toMatchObject({
      confirmed: true,
    });
  });

  it("fails cleanly with LOGIN_REQUIRED when login gates are detected", async () => {
    const context = createContext({
      bodyText: "Sign in to continue",
      passwordCount: 1,
    });

    let failure: unknown = null;

    try {
      await workdayApplyAdapter.analyzeForm(context);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeTruthy();
    const classification = await workdayApplyAdapter.classifyFailure(context, failure);
    expect(classification.failureCode).toBe("LOGIN_REQUIRED");
  });

  it("fails cleanly with CAPTCHA_ENCOUNTERED when captcha gates are detected", async () => {
    const context = createContext({
      bodyText: "Please complete captcha",
      captchaCount: 1,
    });

    let failure: unknown = null;

    try {
      await workdayApplyAdapter.analyzeForm(context);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeTruthy();
    const classification = await workdayApplyAdapter.classifyFailure(context, failure);
    expect(classification.failureCode).toBe("CAPTCHA_ENCOUNTERED");
  });

  it("fails cleanly with REQUIRED_FIELD_UNMAPPED for unmapped required fields", async () => {
    const context = createContext();

    let failure: unknown = null;

    try {
      await workdayApplyAdapter.fillFields(context, {
        entries: [],
        unmappedRequiredFields: [
          {
            fieldType: "text",
            label: "Legal first name",
            name: "first_name",
            required: true,
            selector: "input[name='first_name']",
          },
        ],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeTruthy();
    const classification = await workdayApplyAdapter.classifyFailure(context, failure);
    expect(classification.failureCode).toBe("REQUIRED_FIELD_UNMAPPED");
  });

  it("fails cleanly with FILE_UPLOAD_FAILED when resume staging fails", async () => {
    mocks.stageApplyRunUploadFile.mockRejectedValueOnce(new Error("stage failed"));
    const context = createContext({
      fileInputCount: 1,
    });

    let failure: unknown = null;

    try {
      await workdayApplyAdapter.uploadDocuments(context);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeTruthy();
    const classification = await workdayApplyAdapter.classifyFailure(context, failure);
    expect(classification.failureCode).toBe("FILE_UPLOAD_FAILED");
  });

  it("fails cleanly with TIMEOUT when submit completion times out", async () => {
    const context = createContext({
      bodyText: "Review and submit",
      buttonLabels: ["Submit Application"],
      waitForLoadStateError: new Error("Timeout 250ms exceeded."),
    });

    let failure: unknown = null;

    try {
      await workdayApplyAdapter.submit(context);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeTruthy();
    const classification = await workdayApplyAdapter.classifyFailure(context, failure);
    expect(classification.failureCode).toBe("TIMEOUT");
  });

  it("returns SUBMISSION_NOT_CONFIRMED when submit confirmation stays ambiguous", async () => {
    const context = createContext({
      bodyText: "Review and submit your application",
      url: "https://example.myworkdayjobs.com/recruiting/review",
    });

    await expect(workdayApplyAdapter.confirmSubmission(context)).resolves.toMatchObject({
      confirmed: false,
      failureCode: "SUBMISSION_NOT_CONFIRMED",
    });
  });
});
