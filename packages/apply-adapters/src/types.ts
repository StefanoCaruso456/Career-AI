import type { RunnableConfig } from "@langchain/core/runnables";
import type { Page } from "playwright";
import type {
  ApplyFailureCode,
  ApplyRunDto,
  ApplicationProfileSnapshotDto,
  AtsDetectionResultDto,
} from "@/packages/contracts/src";
import type { PersistedApplyArtifact } from "@/packages/apply-runtime/src/artifacts";
import type { ApplyBrowserSession } from "@/packages/apply-runtime/src/browser-session";

export type VisibleFormField = {
  fieldType: "checkbox" | "file" | "radio" | "select" | "text" | "textarea";
  label: string | null;
  name: string | null;
  required: boolean;
  selector: string;
};

export type FieldMappingEntry = {
  fieldType: VisibleFormField["fieldType"];
  label: string | null;
  selector: string;
  sourceKey: string;
  value: unknown;
};

export type FieldMappingPlan = {
  entries: FieldMappingEntry[];
  unmappedRequiredFields: VisibleFormField[];
};

export type ApplyAdapterContext = {
  page: Page;
  run: ApplyRunDto;
  runnableConfig?: RunnableConfig;
  session: ApplyBrowserSession;
  snapshot: ApplicationProfileSnapshotDto;
};

export type ApplyConfirmationResult = {
  confirmed: boolean;
  failureCode?: ApplyFailureCode | null;
  message: string;
};

export type ApplyAdapter = {
  advanceSteps: (context: ApplyAdapterContext) => Promise<void>;
  analyzeForm: (context: ApplyAdapterContext) => Promise<VisibleFormField[]>;
  canHandle: (target: AtsDetectionResultDto) => boolean;
  classifyFailure: (
    context: ApplyAdapterContext,
    error: unknown,
  ) => Promise<{
    failureCode: ApplyFailureCode;
    message: string;
  }>;
  collectArtifacts: (context: ApplyAdapterContext) => Promise<PersistedApplyArtifact[]>;
  confirmSubmission: (context: ApplyAdapterContext) => Promise<ApplyConfirmationResult>;
  createMappingPlan: (
    context: ApplyAdapterContext,
    fields: VisibleFormField[],
  ) => Promise<FieldMappingPlan>;
  family: AtsDetectionResultDto["atsFamily"];
  fillFields: (context: ApplyAdapterContext, plan: FieldMappingPlan) => Promise<void>;
  id: string;
  openTarget: (context: ApplyAdapterContext) => Promise<void>;
  preflight: (context: ApplyAdapterContext) => Promise<void>;
  submit: (context: ApplyAdapterContext) => Promise<void>;
  uploadDocuments: (context: ApplyAdapterContext) => Promise<void>;
};
