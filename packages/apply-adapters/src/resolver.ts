import { AtsDetectionResultDto } from "@/packages/contracts/src";

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
