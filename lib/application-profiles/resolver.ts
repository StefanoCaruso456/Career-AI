import type { JobPostingDto } from "@/packages/contracts/src";
import type { SchemaFamily } from "./types";

type SchemaFamilyResolverInput = {
  applyUrl: string;
  companyName?: string | null;
  sourceKey?: string | null;
};

export function resolveSchemaFamily(input: SchemaFamilyResolverInput): SchemaFamily {
  const companyName = input.companyName?.trim().toLowerCase() ?? "";
  const sourceKey = input.sourceKey?.trim().toLowerCase() ?? "";

  try {
    const parsedUrl = new URL(input.applyUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    if (
      hostname.includes("stripe.com") ||
      companyName === "stripe" ||
      pathname.includes("/stripe")
    ) {
      return "stripe";
    }

    if (
      hostname.includes("workday") ||
      hostname.includes("myworkdayjobs") ||
      pathname.includes("workdayjobs")
    ) {
      return "workday";
    }

    if (
      hostname.includes("greenhouse") ||
      sourceKey.startsWith("greenhouse:")
    ) {
      return "greenhouse";
    }
  } catch {
    if (companyName === "stripe") {
      return "stripe";
    }
  }

  // Default to the lighter Greenhouse-family profile for providers like Lever or
  // generic hosted apply URLs until we add more schema families.
  return "greenhouse";
}

export function resolveSchemaFamilyForJob(job: Pick<JobPostingDto, "applyUrl" | "companyName" | "sourceKey">) {
  return resolveSchemaFamily({
    applyUrl: job.applyUrl,
    companyName: job.companyName,
    sourceKey: job.sourceKey,
  });
}
