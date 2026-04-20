import { getSchemaFamilyConfig } from "@/lib/application-profiles/config";
import {
  getAutonomousApplyConfirmationTimeoutMs,
  getAutonomousApplyNavigationTimeoutMs,
  getAutonomousApplyStepTimeoutMs,
  getAutonomousApplySubmitTimeoutMs,
} from "@/packages/apply-domain/src";
import {
  persistApplyRunScreenshot,
  persistApplyRunTextArtifact,
  type PersistedApplyArtifact,
} from "@/packages/apply-runtime/src/artifacts";
import { stageApplyRunUploadFile } from "@/packages/apply-runtime/src/documents";
import { traceApplyTool } from "@/packages/apply-runtime/src/langsmith";
import type { ApplyFailureCode } from "@/packages/contracts/src";
import type {
  ApplyAdapter,
  ApplyAdapterContext,
  FieldMappingPlan,
  VisibleFormField,
} from "./types";

function normalizeText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function escapeAttributeValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

class GreenhouseApplyError extends Error {
  readonly failureCode: ApplyFailureCode;
  readonly metadata: Record<string, unknown>;

  constructor(args: {
    failureCode: ApplyFailureCode;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = "GreenhouseApplyError";
    this.failureCode = args.failureCode;
    this.metadata = args.metadata ?? {};
  }
}

function createGreenhouseError(args: {
  failureCode: ApplyFailureCode;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  return new GreenhouseApplyError(args);
}

async function waitForWithTimeout<T>(args: {
  timeoutMs: number;
  operationName: string;
  invoke: () => Promise<T>;
}) {
  try {
    return await args.invoke();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.toLowerCase().includes("timeout")) {
      throw createGreenhouseError({
        failureCode: "TIMEOUT",
        message: `Greenhouse operation timed out while ${args.operationName}.`,
        metadata: {
          operationName: args.operationName,
        },
      });
    }

    throw error;
  }
}

async function detectBlockingSignals(
  context: ApplyAdapterContext,
  args: {
    stage: string;
  },
) {
  const bodyText = normalizeText(await context.page.textContent("body").catch(() => ""));
  const currentUrl = normalizeText(context.page.url());
  const hasCaptchaWidget =
    (await context.page
      .locator(
        "iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha, [data-sitekey], #challenge-running",
      )
      .count()
      .catch(() => 0)) > 0;
  const hasCaptchaText =
    bodyText.includes("captcha") ||
    bodyText.includes("i am not a robot") ||
    currentUrl.includes("captcha");

  if (hasCaptchaWidget || hasCaptchaText) {
    throw createGreenhouseError({
      failureCode: "CAPTCHA_ENCOUNTERED",
      message: `CAPTCHA encountered during ${args.stage}.`,
      metadata: {
        stage: args.stage,
      },
    });
  }

  const passwordFieldCount = await context.page
    .locator("input[type='password'], [name*='password'], [id*='password']")
    .count()
    .catch(() => 0);
  const hasLoginText =
    bodyText.includes("sign in") ||
    bodyText.includes("log in") ||
    bodyText.includes("login to continue") ||
    currentUrl.includes("/users/sign_in");

  if (passwordFieldCount > 0 || hasLoginText) {
    throw createGreenhouseError({
      failureCode: "LOGIN_REQUIRED",
      message: `Login is required before continuing autonomous apply (${args.stage}).`,
      metadata: {
        stage: args.stage,
      },
    });
  }
}

function buildFieldKeyLookup() {
  const fieldConfig = getSchemaFamilyConfig("greenhouse").fields;
  const entries = new Map<string, string>();

  for (const field of fieldConfig) {
    entries.set(normalizeText(field.key), field.key);
    entries.set(normalizeText(field.label), field.key);
  }

  entries.set("resume", "resume_cv_file");
  entries.set("resume/cv", "resume_cv_file");
  entries.set("resume cv", "resume_cv_file");
  entries.set("linkedin profile", "linkedin_url");
  entries.set("linkedin", "linkedin_url");
  entries.set("portfolio", "portfolio_url");
  entries.set("website", "website_url");
  entries.set("github", "github_url");

  return entries;
}

const greenhouseFieldKeyLookup = buildFieldKeyLookup();

function pickProfileValue(
  sourceProfile: Record<string, unknown>,
  label: string | null,
  name: string | null,
) {
  const candidates = [label, name]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    const sourceKey = greenhouseFieldKeyLookup.get(candidate);

    if (!sourceKey) {
      continue;
    }

    const value = sourceProfile[sourceKey];

    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) {
      continue;
    }

    return {
      sourceKey,
      value,
    };
  }

  return null;
}

function isResumeField(field: Pick<VisibleFormField, "label" | "name">) {
  const haystack = `${normalizeText(field.label)} ${normalizeText(field.name)}`;
  return haystack.includes("resume");
}

function isCoverLetterField(field: Pick<VisibleFormField, "label" | "name">) {
  const haystack = `${normalizeText(field.label)} ${normalizeText(field.name)}`;
  return haystack.includes("cover letter");
}

async function extractVisibleFields(context: ApplyAdapterContext): Promise<VisibleFormField[]> {
  const handles = await context.page
    .locator("form input:not([type='hidden']), form textarea, form select")
    .elementHandles();
  const fields: VisibleFormField[] = [];

  for (const handle of handles) {
    const boundingBox = await handle.boundingBox();

    if (!boundingBox) {
      continue;
    }

    const descriptor = await handle.evaluate((element: Element) => {
      const htmlElement = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const id = htmlElement.getAttribute("id");
      const name = htmlElement.getAttribute("name");
      const type = (htmlElement.getAttribute("type") || htmlElement.tagName).toLowerCase();
      const ariaLabel = htmlElement.getAttribute("aria-label");
      const placeholder = htmlElement.getAttribute("placeholder");
      const dataQa = htmlElement.getAttribute("data-qa");
      const value = htmlElement.getAttribute("value");
      const required =
        htmlElement.required ||
        htmlElement.getAttribute("aria-required") === "true" ||
        htmlElement.getAttribute("required") !== null;
      const label =
        ariaLabel ||
        (id ? document.querySelector(`label[for="${id}"]`)?.textContent : null) ||
        htmlElement.closest("label")?.textContent ||
        htmlElement.closest(".field")?.querySelector("label")?.textContent ||
        placeholder ||
        dataQa ||
        name;

      return {
        dataQa,
        id,
        label,
        name,
        required,
        tagName: htmlElement.tagName.toLowerCase(),
        type,
        value,
      };
    });

    const selector =
      descriptor.id
        ? `#${escapeAttributeValue(descriptor.id)}`
        : descriptor.name && descriptor.type === "radio" && descriptor.value
          ? `input[name="${escapeAttributeValue(descriptor.name)}"][value="${escapeAttributeValue(descriptor.value)}"]`
          : descriptor.name
            ? `${descriptor.tagName}[name="${escapeAttributeValue(descriptor.name)}"]`
            : descriptor.dataQa
              ? `[data-qa="${escapeAttributeValue(descriptor.dataQa)}"]`
              : null;

    if (!selector) {
      continue;
    }

    const fieldType: VisibleFormField["fieldType"] =
      descriptor.tagName === "textarea"
        ? "textarea"
        : descriptor.tagName === "select"
          ? "select"
          : descriptor.type === "checkbox"
            ? "checkbox"
            : descriptor.type === "radio"
              ? "radio"
              : descriptor.type === "file"
                ? "file"
                : "text";

    fields.push({
      fieldType,
      label: descriptor.label?.trim() || null,
      name: descriptor.name?.trim() || null,
      required: descriptor.required,
      selector,
    });
  }

  return fields;
}

async function fillMappedField(
  context: ApplyAdapterContext,
  entry: FieldMappingPlan["entries"][number],
) {
  const locator = context.page.locator(entry.selector).first();

  if (entry.fieldType === "checkbox") {
    const shouldCheck =
      entry.value === true ||
      ["true", "yes"].includes(String(entry.value).trim().toLowerCase());

    await traceApplyTool({
      config: context.runnableConfig,
      input: {
        selector: entry.selector,
        shouldCheck,
      },
      invoke: async () => {
        if (shouldCheck) {
          await locator.check({
            force: true,
          });
        } else {
          await locator.uncheck({
            force: true,
          });
        }
      },
      name: "fill_greenhouse_checkbox_field",
      tags: ["ats:greenhouse"],
    });
    return;
  }

  if (entry.fieldType === "select") {
    const value = Array.isArray(entry.value) ? String(entry.value[0] ?? "") : String(entry.value);

    await traceApplyTool({
      config: context.runnableConfig,
      input: {
        selector: entry.selector,
        value,
      },
      invoke: async () => {
        await locator.selectOption({
          label: value,
        }).catch(async () => {
          await locator.selectOption(value);
        });
      },
      name: "fill_greenhouse_select_field",
      tags: ["ats:greenhouse"],
    });
    return;
  }

  const value = Array.isArray(entry.value) ? entry.value.join(", ") : String(entry.value);

  await traceApplyTool({
    config: context.runnableConfig,
    input: {
      selector: entry.selector,
      value,
    },
    invoke: async () => {
      await locator.fill(value);
    },
    name: "fill_greenhouse_text_field",
    tags: ["ats:greenhouse"],
  });
}

async function clickButtonByPatterns(
  context: ApplyAdapterContext,
  patterns: RegExp[],
  toolName: string,
) {
  const buttons = context.page.locator("button, [role='button'], input[type='submit']");
  const count = await buttons.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    const label = normalizeText(
      (await candidate.textContent().catch(() => "")) ||
        (await candidate.innerText().catch(() => "")),
    );

    if (!patterns.some((pattern) => pattern.test(label))) {
      continue;
    }

    await traceApplyTool({
      config: context.runnableConfig,
      input: {
        label,
      },
      invoke: async () => {
        await candidate.click({
          force: true,
        });
      },
      name: toolName,
      tags: ["ats:greenhouse"],
    });

    return true;
  }

  return false;
}

export const greenhouseApplyAdapter: ApplyAdapter = {
  advanceSteps: async (context) => {
    await detectBlockingSignals(context, {
      stage: "advance steps",
    });
  },
  analyzeForm: async (context) => {
    await detectBlockingSignals(context, {
      stage: "analyze form",
    });

    return extractVisibleFields(context);
  },
  canHandle: (target) => target.atsFamily === "greenhouse",
  classifyFailure: async (_context, error) => {
    if (error instanceof GreenhouseApplyError) {
      return {
        failureCode: error.failureCode,
        message: error.message,
      };
    }

    const message = error instanceof Error ? error.message : "Unknown Greenhouse apply failure.";
    const normalized = normalizeText(message);

    if (normalized.includes("login")) {
      return {
        failureCode: "LOGIN_REQUIRED",
        message,
      };
    }

    if (normalized.includes("captcha")) {
      return {
        failureCode: "CAPTCHA_ENCOUNTERED",
        message,
      };
    }

    if (normalized.includes("resume") && normalized.includes("missing")) {
      return {
        failureCode: "REQUIRED_DOCUMENT_MISSING",
        message,
      };
    }

    if (normalized.includes("upload")) {
      return {
        failureCode: "FILE_UPLOAD_FAILED",
        message,
      };
    }

    if (normalized.includes("unmapped")) {
      return {
        failureCode: "REQUIRED_FIELD_UNMAPPED",
        message,
      };
    }

    if (normalized.includes("submit")) {
      return {
        failureCode: "SUBMIT_BLOCKED",
        message,
      };
    }

    if (normalized.includes("confirm")) {
      return {
        failureCode: "SUBMISSION_NOT_CONFIRMED",
        message,
      };
    }

    return {
      failureCode: "UNKNOWN_RUNTIME_ERROR",
      message,
    };
  },
  collectArtifacts: async (context) => {
    const pageHtml = await context.page.content();
    const artifact = await persistApplyRunTextArtifact({
      artifactType: "dom_snapshot",
      content: pageHtml,
      contentType: "text/html",
      fileName: "latest-dom.html",
      metadataJson: {
        url: context.page.url(),
      },
      runId: context.run.id,
    });

    return [artifact] satisfies PersistedApplyArtifact[];
  },
  confirmSubmission: async (context) => {
    const deadlineMs = Date.now() + getAutonomousApplyConfirmationTimeoutMs();

    while (Date.now() < deadlineMs) {
      await detectBlockingSignals(context, {
        stage: "submission confirmation",
      });

      const pageText = normalizeText(await context.page.textContent("body").catch(() => ""));
      const currentUrl = normalizeText(context.page.url());

      if (
        pageText.includes("thank you") ||
        pageText.includes("application submitted") ||
        pageText.includes("application received") ||
        pageText.includes("your application has been submitted") ||
        currentUrl.includes("thank_you") ||
        currentUrl.includes("confirmation")
      ) {
        return {
          confirmed: true,
          message: "Greenhouse confirmation markers detected.",
        };
      }

      await context.page.waitForTimeout(700).catch(() => undefined);
    }

    return {
      confirmed: false,
      failureCode: "SUBMISSION_NOT_CONFIRMED",
      message: "Greenhouse submission could not be confirmed before timeout.",
    };
  },
  createMappingPlan: async (context, fields) => {
    const sourceProfile = context.snapshot.sourceProfile;
    const entries: FieldMappingPlan["entries"] = [];
    const unmappedRequiredFields: VisibleFormField[] = [];

    for (const field of fields) {
      if (field.fieldType === "file" || field.fieldType === "radio") {
        if (
          field.required &&
          !isResumeField(field) &&
          !isCoverLetterField(field)
        ) {
          unmappedRequiredFields.push(field);
        }
        continue;
      }

      const matched = pickProfileValue(sourceProfile, field.label, field.name);

      if (!matched) {
        if (field.required) {
          unmappedRequiredFields.push(field);
        }
        continue;
      }

      entries.push({
        fieldType: field.fieldType,
        label: field.label,
        selector: field.selector,
        sourceKey: matched.sourceKey,
        value: matched.value,
      });
    }

    return traceApplyTool({
      config: context.runnableConfig,
      input: {
        mappedCount: entries.length,
        unmappedRequiredCount: unmappedRequiredFields.length,
      },
      invoke: async () => ({
        entries,
        unmappedRequiredFields,
      }),
      name: "map_greenhouse_canonical_fields",
      tags: ["ats:greenhouse"],
    });
  },
  family: "greenhouse",
  fillFields: async (context, plan) => {
    if (plan.unmappedRequiredFields.length > 0) {
      const unmappedLabels = plan.unmappedRequiredFields
        .map((field) => field.label || field.name || field.selector)
        .slice(0, 5);
      throw createGreenhouseError({
        failureCode: "REQUIRED_FIELD_UNMAPPED",
        message: `Required fields were visible but could not be mapped safely: ${unmappedLabels.join(", ")}.`,
        metadata: {
          unmappedLabels,
        },
      });
    }

    for (const entry of plan.entries) {
      await fillMappedField(context, entry);
    }
  },
  id: "greenhouse_primary",
  openTarget: async (context) => {
    await traceApplyTool({
      config: context.runnableConfig,
      input: {
        url: context.run.jobPostingUrl,
      },
      invoke: async () => {
        await waitForWithTimeout({
          invoke: async () =>
            context.page.goto(context.run.jobPostingUrl, {
              timeout: getAutonomousApplyNavigationTimeoutMs(),
              waitUntil: "domcontentloaded",
            }),
          operationName: "opening Greenhouse target URL",
          timeoutMs: getAutonomousApplyNavigationTimeoutMs(),
        });
      },
      name: "open_greenhouse_application_url",
      tags: ["ats:greenhouse"],
    });
    await detectBlockingSignals(context, {
      stage: "open target",
    });

    await persistApplyRunScreenshot({
      artifactType: "screenshot_initial",
      label: "initial-page",
      page: context.page,
      runId: context.run.id,
    });
  },
  preflight: async (context) => {
    if (context.snapshot.schemaFamily !== "greenhouse") {
      throw createGreenhouseError({
        failureCode: "PROFILE_INCOMPLETE",
        message: "The selected profile snapshot is not a Greenhouse-compatible profile.",
      });
    }

    if (!context.snapshot.documents.resume) {
      throw createGreenhouseError({
        failureCode: "REQUIRED_DOCUMENT_MISSING",
        message: "A resume is required before starting autonomous Greenhouse apply.",
      });
    }
  },
  submit: async (context) => {
    await detectBlockingSignals(context, {
      stage: "submit",
    });

    await persistApplyRunScreenshot({
      artifactType: "screenshot_before_submit",
      label: "before-submit",
      page: context.page,
      runId: context.run.id,
    });
    const clicked = await clickButtonByPatterns(
      context,
      [/submit/i, /submit application/i, /apply/i],
      "click_greenhouse_submit",
    );

    if (!clicked) {
      throw createGreenhouseError({
        failureCode: "SUBMIT_BLOCKED",
        message: "Greenhouse submit action was not available.",
      });
    }

    await waitForWithTimeout({
      invoke: async () =>
        context.page.waitForLoadState("networkidle", {
          timeout: getAutonomousApplySubmitTimeoutMs(),
        }),
      operationName: "waiting for submit completion",
      timeoutMs: getAutonomousApplySubmitTimeoutMs(),
    });
  },
  uploadDocuments: async (context) => {
    await detectBlockingSignals(context, {
      stage: "upload documents",
    });

    const resume = context.snapshot.documents.resume;

    if (!resume) {
      throw createGreenhouseError({
        failureCode: "REQUIRED_DOCUMENT_MISSING",
        message: "A resume is required for autonomous apply.",
      });
    }

    const fields = await extractVisibleFields(context);
    const fileFields = fields.filter((field) => field.fieldType === "file");

    if (fileFields.length === 0) {
      return;
    }

    const absolutePath = await stageApplyRunUploadFile({
      artifactId: resume.artifactId,
      fileName: resume.fileName,
      runId: context.run.id,
    }).catch(() => {
      throw createGreenhouseError({
        failureCode: "FILE_UPLOAD_FAILED",
        message: "Greenhouse resume staging failed before upload.",
      });
    });

    for (const field of fileFields) {
      if (isCoverLetterField(field)) {
        if (field.required) {
          throw createGreenhouseError({
            failureCode: "REQUIRED_DOCUMENT_MISSING",
            message: "A required cover letter is not yet supported for autonomous Greenhouse apply.",
          });
        }
        continue;
      }

      if (!isResumeField(field)) {
        if (field.required) {
          throw createGreenhouseError({
            failureCode: "REQUIRED_DOCUMENT_MISSING",
            message: "A required Greenhouse document upload could not be satisfied safely.",
          });
        }
        continue;
      }

      await traceApplyTool({
        config: context.runnableConfig,
        input: {
          fileName: resume.fileName,
          selector: field.selector,
        },
        invoke: async () => {
          await waitForWithTimeout({
            invoke: async () =>
              context.page.locator(field.selector).first().setInputFiles(absolutePath),
            operationName: "uploading Greenhouse resume",
            timeoutMs: getAutonomousApplyStepTimeoutMs(),
          });
        },
        name: "upload_greenhouse_resume",
        tags: ["ats:greenhouse"],
      }).catch((error) => {
        throw createGreenhouseError({
          failureCode: "FILE_UPLOAD_FAILED",
          message: error instanceof Error ? error.message : "Greenhouse document upload failed.",
        });
      });
    }
  },
};
