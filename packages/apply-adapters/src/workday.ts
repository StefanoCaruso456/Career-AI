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

class WorkdayApplyError extends Error {
  readonly failureCode: ApplyFailureCode;
  readonly metadata: Record<string, unknown>;

  constructor(args: {
    failureCode: ApplyFailureCode;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = "WorkdayApplyError";
    this.failureCode = args.failureCode;
    this.metadata = args.metadata ?? {};
  }
}

function createWorkdayError(args: {
  failureCode: ApplyFailureCode;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  return new WorkdayApplyError(args);
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
      throw createWorkdayError({
        failureCode: "TIMEOUT",
        message: `Workday operation timed out while ${args.operationName}.`,
        metadata: {
          operationName: args.operationName,
        },
      });
    }

    throw error;
  }
}

async function detectBlockingSignals(context: ApplyAdapterContext, args: {
  stage: string;
}) {
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
    throw createWorkdayError({
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
    currentUrl.includes("login");

  if (passwordFieldCount > 0 || hasLoginText) {
    throw createWorkdayError({
      failureCode: "LOGIN_REQUIRED",
      message: `Login is required before continuing autonomous apply (${args.stage}).`,
      metadata: {
        stage: args.stage,
      },
    });
  }
}

function buildFieldKeyLookup() {
  const fieldConfig = getSchemaFamilyConfig("workday").fields;
  const entries = new Map<string, string>();

  for (const field of fieldConfig) {
    entries.set(normalizeText(field.key), field.key);
    entries.set(normalizeText(field.label), field.key);
  }

  return entries;
}

const workdayFieldKeyLookup = buildFieldKeyLookup();

async function extractVisibleFields(context: ApplyAdapterContext): Promise<VisibleFormField[]> {
  const handles = await context.page.locator("input, textarea, select").elementHandles();
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
      const automationId = htmlElement.getAttribute("data-automation-id");
      const required =
        htmlElement.required ||
        htmlElement.getAttribute("aria-required") === "true" ||
        htmlElement.getAttribute("data-required") === "true";
      const label =
        ariaLabel ||
        (id ? document.querySelector(`label[for="${id}"]`)?.textContent : null) ||
        htmlElement.closest("label")?.textContent ||
        placeholder ||
        automationId ||
        name;

      return {
        automationId,
        id,
        label,
        name,
        required,
        tagName: htmlElement.tagName.toLowerCase(),
        type,
      };
    });

    const selector =
      descriptor.automationId
        ? `[data-automation-id="${escapeAttributeValue(descriptor.automationId)}"]`
        : descriptor.id
          ? `#${escapeAttributeValue(descriptor.id)}`
          : descriptor.name
            ? `${descriptor.tagName}[name="${escapeAttributeValue(descriptor.name)}"]`
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

function pickProfileValue(sourceProfile: Record<string, unknown>, label: string | null, name: string | null) {
  const candidates = [label, name]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    const sourceKey = workdayFieldKeyLookup.get(candidate);

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

async function fillMappedField(context: ApplyAdapterContext, entry: FieldMappingPlan["entries"][number]) {
  const locator = context.page.locator(entry.selector).first();

  if (entry.fieldType === "checkbox") {
    const shouldCheck = entry.value === true || String(entry.value).toLowerCase() === "true";

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
      name: "fill_checkbox_field",
      tags: ["ats:workday"],
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
      name: "fill_select_field",
      tags: ["ats:workday"],
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
    name: "fill_text_field",
    tags: ["ats:workday"],
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
    const locator = buttons.nth(index);
    const label = normalizeText(
      (await locator.innerText().catch(() => "")) ||
        (await locator.textContent().catch(() => "")),
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
        await waitForWithTimeout({
          invoke: async () =>
            locator.click({
              force: true,
            }),
          operationName: `${toolName} click`,
          timeoutMs: getAutonomousApplyStepTimeoutMs(),
        });
      },
      name: toolName,
      tags: ["ats:workday"],
    });

    return true;
  }

  return false;
}

export const workdayApplyAdapter: ApplyAdapter = {
  advanceSteps: async (context) => {
    await detectBlockingSignals(context, {
      stage: "step navigation",
    });

    for (let step = 0; step < 8; step += 1) {
      const advanced = await clickButtonByPatterns(
        context,
        [/next/i, /continue/i, /review/i],
        "click_continue",
      );

      if (!advanced) {
        return;
      }

      await waitForWithTimeout({
        invoke: async () =>
          context.page.waitForLoadState("networkidle", {
            timeout: getAutonomousApplyStepTimeoutMs(),
          }),
        operationName: "waiting for step navigation",
        timeoutMs: getAutonomousApplyStepTimeoutMs(),
      });
      await detectBlockingSignals(context, {
        stage: `step navigation ${step + 1}`,
      });

      const fields = await extractVisibleFields(context);
      const plan = await workdayApplyAdapter.createMappingPlan(context, fields);
      await workdayApplyAdapter.fillFields(context, plan);
      await workdayApplyAdapter.uploadDocuments(context);
    }
  },
  analyzeForm: async (context) => {
    await detectBlockingSignals(context, {
      stage: "form analysis",
    });

    return traceApplyTool({
      config: context.runnableConfig,
      input: {
        runId: context.run.id,
      },
      invoke: async () => extractVisibleFields(context),
      name: "analyze_form_fields",
      tags: ["ats:workday"],
    });
  },
  canHandle: (target) => target.atsFamily === "workday",
  classifyFailure: async (_context, error) => {
    if (error instanceof WorkdayApplyError) {
      return {
        failureCode: error.failureCode,
        message: error.message,
      };
    }

    const message = error instanceof Error ? error.message : "Unknown autonomous apply error.";
    const normalized = normalizeText(message);

    if (normalized.includes("workday-compatible profile")) {
      return {
        failureCode: "PROFILE_INCOMPLETE",
        message,
      };
    }

    if (
      normalized.includes("network") ||
      normalized.includes("net::") ||
      normalized.includes("connection")
    ) {
      return {
        failureCode: "NETWORK_FAILURE",
        message,
      };
    }

    if (normalized.includes("captcha")) {
      return {
        failureCode: "CAPTCHA_ENCOUNTERED",
        message,
      };
    }

    if (normalized.includes("login") || normalized.includes("sign in") || normalized.includes("password")) {
      return {
        failureCode: "LOGIN_REQUIRED",
        message,
      };
    }

    if (normalized.includes("timeout")) {
      return {
        failureCode: "TIMEOUT",
        message,
      };
    }

    if (normalized.includes("resume") || normalized.includes("document")) {
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

    if (normalized.includes("submit action was not available") || normalized.includes("submit blocked")) {
      return {
        failureCode: "SUBMIT_BLOCKED",
        message,
      };
    }

    if (normalized.includes("submission could not be confirmed")) {
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

    return [artifact];
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
        pageText.includes("thank you for applying") ||
        pageText.includes("application submitted") ||
        pageText.includes("application received") ||
        currentUrl.includes("submission") ||
        currentUrl.includes("thank-you")
      ) {
        return {
          confirmed: true,
          message: "Workday confirmation markers detected.",
        };
      }

      await context.page.waitForTimeout(700).catch(() => undefined);
    }

    return {
      confirmed: false,
      failureCode: "SUBMISSION_NOT_CONFIRMED",
      message: "Workday submission could not be confirmed before timeout.",
    };
  },
  createMappingPlan: async (context, fields) => {
    const sourceProfile = context.snapshot.sourceProfile;
    const entries: FieldMappingPlan["entries"] = [];
    const unmappedRequiredFields: VisibleFormField[] = [];

    for (const field of fields) {
      if (field.fieldType === "file") {
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
      name: "map_canonical_fields",
      tags: ["ats:workday"],
    });
  },
  family: "workday",
  fillFields: async (context, plan) => {
    if (plan.unmappedRequiredFields.length > 0) {
      const unmappedLabels = plan.unmappedRequiredFields
        .map((field) => field.label || field.name || field.selector)
        .slice(0, 5);
      throw createWorkdayError({
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
  id: "workday_primary",
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
          operationName: "opening Workday target URL",
          timeoutMs: getAutonomousApplyNavigationTimeoutMs(),
        });
      },
      name: "open_application_url",
      tags: ["ats:workday"],
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
    if (context.snapshot.schemaFamily !== "workday") {
      throw createWorkdayError({
        failureCode: "PROFILE_INCOMPLETE",
        message: "The selected profile snapshot is not a Workday-compatible profile.",
      });
    }

    if (!context.snapshot.documents.resume) {
      throw createWorkdayError({
        failureCode: "REQUIRED_DOCUMENT_MISSING",
        message: "A resume is required before starting autonomous Workday apply.",
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
      [/submit/i, /send application/i, /apply now/i],
      "click_submit",
    );

    if (!clicked) {
      throw createWorkdayError({
        failureCode: "SUBMIT_BLOCKED",
        message: "Workday submit action was not available.",
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
    const resume = context.snapshot.documents.resume;

    if (!resume) {
      throw createWorkdayError({
        failureCode: "REQUIRED_DOCUMENT_MISSING",
        message: "A resume is required for autonomous apply.",
      });
    }

    const fileInputs = context.page.locator("input[type='file']");
    const count = await fileInputs.count();

    if (count === 0) {
      return;
    }

    const absolutePath = await stageApplyRunUploadFile({
      artifactId: resume.artifactId,
      fileName: resume.fileName,
      runId: context.run.id,
    }).catch(() => {
      throw createWorkdayError({
        failureCode: "FILE_UPLOAD_FAILED",
        message: "Workday resume staging failed before upload.",
      });
    });

    await traceApplyTool({
      config: context.runnableConfig,
      input: {
        fileName: resume.fileName,
      },
      invoke: async () => {
        await waitForWithTimeout({
          invoke: async () => fileInputs.first().setInputFiles(absolutePath),
          operationName: "uploading resume",
          timeoutMs: getAutonomousApplyStepTimeoutMs(),
        });
      },
      name: "upload_document",
      tags: ["ats:workday"],
    }).catch((error) => {
      throw createWorkdayError({
        failureCode: "FILE_UPLOAD_FAILED",
        message: error instanceof Error ? error.message : "Workday document upload failed.",
      });
    });
  },
};
