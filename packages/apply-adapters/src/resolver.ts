import type {
  ApplyAtsFamily,
  AtsDetectionResultDto,
} from "@/packages/contracts/src/apply";
import type { JobApplyTargetDto } from "@/packages/contracts/src/jobs";

const supportedAutonomousApplyFamilies = new Set<ApplyAtsFamily>([
  "greenhouse",
  "workday",
]);

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function detectApplyTarget(args: {
  currentUrl?: string | null;
  jobPostingUrl: string;
  pageHtml?: string | null;
  pageTitle?: string | null;
}): AtsDetectionResultDto {
  const urlValue = normalizeText(args.currentUrl ?? args.jobPostingUrl);
  const titleValue = normalizeText(args.pageTitle);
  const htmlValue = normalizeText(args.pageHtml);

  if (
    urlValue.includes("myworkdayjobs") ||
    urlValue.includes("myworkdaysite") ||
    urlValue.includes("workdayjobs") ||
    titleValue.includes("workday") ||
    htmlValue.includes("workday")
  ) {
    return {
      atsFamily: "workday",
      confidence: 0.98,
      fallbackStrategy: null,
      matchedRule: "workday_url_or_dom_signature",
    };
  }

  if (urlValue.includes("greenhouse")) {
    return {
      atsFamily: "greenhouse",
      confidence: 0.95,
      fallbackStrategy: "unsupported_target",
      matchedRule: "greenhouse_url_signature",
    };
  }

  if (urlValue.includes("lever.co") || urlValue.includes("/lever")) {
    return {
      atsFamily: "lever",
      confidence: 0.95,
      fallbackStrategy: "unsupported_target",
      matchedRule: "lever_url_signature",
    };
  }

  if (htmlValue.includes("<form") || htmlValue.includes("application")) {
    return {
      atsFamily: "generic_hosted_form",
      confidence: 0.45,
      fallbackStrategy: "unsupported_target",
      matchedRule: "generic_form_dom_signature",
    };
  }

  return {
    atsFamily: "unsupported_target",
    confidence: 0.15,
    fallbackStrategy: null,
    matchedRule: "no_known_signature",
  };
}

export function isAutonomousApplySupportedAtsFamily(
  atsFamily: ApplyAtsFamily | null | undefined,
) {
  return Boolean(atsFamily && supportedAutonomousApplyFamilies.has(atsFamily));
}

export function resolveJobApplyTarget(args: {
  canonicalApplyUrl: string | null | undefined;
  orchestrationReadiness?: boolean | null;
}): JobApplyTargetDto {
  const normalizedUrl = args.canonicalApplyUrl?.trim() || "";

  if (!normalizedUrl) {
    return {
      atsFamily: null,
      confidence: null,
      matchedRule: "missing_apply_url",
      routingMode: "open_external",
      supportReason: "missing_apply_url",
      supportStatus: "unsupported",
    };
  }

  const detection = detectApplyTarget({
    jobPostingUrl: normalizedUrl,
  });
  const supportedFamily = isAutonomousApplySupportedAtsFamily(detection.atsFamily);
  const supported = Boolean(args.orchestrationReadiness) && supportedFamily;

  if (supported) {
    return {
      atsFamily: detection.atsFamily,
      confidence: detection.confidence,
      matchedRule: detection.matchedRule,
      routingMode: "queue_autonomous_apply",
      supportReason: "supported_ats_family",
      supportStatus: "supported",
    };
  }

  if (detection.atsFamily === "unsupported_target") {
    return {
      atsFamily: detection.atsFamily,
      confidence: detection.confidence,
      matchedRule: detection.matchedRule,
      routingMode: "open_external",
      supportReason: "ats_detection_inconclusive",
      supportStatus: "unknown",
    };
  }

  return {
    atsFamily: detection.atsFamily,
    confidence: detection.confidence,
    matchedRule: detection.matchedRule,
    routingMode: "open_external",
    supportReason: Boolean(args.orchestrationReadiness)
      ? "unsupported_ats_family"
      : "job_not_ready_for_autonomous_apply",
    supportStatus: "unsupported",
  };
}
