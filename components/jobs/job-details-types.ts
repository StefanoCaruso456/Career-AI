export type JobDetailsPreview = {
  applyUrl: string;
  company: string | null;
  descriptionSnippet?: string | null;
  employmentType: string | null;
  externalJobId: string | null;
  id: string;
  location: string | null;
  postedAt: string | null;
  sourceLabel: string;
  sourceUrl: string;
  title: string;
  workplaceType: "remote" | "hybrid" | "onsite" | "unknown" | null;
};
