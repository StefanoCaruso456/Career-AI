import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobsResults } from "@/app/jobs/jobs-results";
import type { JobPostingDto } from "@/packages/contracts/src";

function createJob(index: number): JobPostingDto {
  return {
    id: `job-${index}`,
    externalId: `external-${index}`,
    title: `Role ${index}`,
    companyName: "Figma",
    location: "San Francisco, CA",
    department: "Sales",
    commitment: "Full-time",
    sourceKey: "greenhouse:figma",
    sourceLabel: "Figma",
    sourceLane: "ats_direct",
    sourceQuality: "high_signal",
    applyUrl: `https://jobs.example.com/${index}`,
    postedAt: "2026-04-09T12:00:00.000Z",
    updatedAt: "2026-04-10T12:00:00.000Z",
    descriptionSnippet: null,
  };
}

describe("JobsResults", () => {
  it("shows 24 roles first and reveals 29 more when requested", () => {
    const jobs = Array.from({ length: 53 }, (_, index) => createJob(index + 1));

    render(<JobsResults jobs={jobs} />);

    expect(screen.getByText("Showing 24 of 53 roles currently loaded.")).toBeInTheDocument();
    expect(screen.getByText("Role 24")).toBeInTheDocument();
    expect(screen.queryByText("Role 25")).not.toBeInTheDocument();
    expect(screen.getByText("Reveal 29 more roles.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More..." }));

    expect(screen.getByText("Showing 53 of 53 roles currently loaded.")).toBeInTheDocument();
    expect(screen.getByText("Role 53")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More..." })).not.toBeInTheDocument();
  });
});
