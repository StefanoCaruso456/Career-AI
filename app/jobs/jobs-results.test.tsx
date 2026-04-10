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

    expect(screen.getByText("Showing 24 of 53 matching roles from 53 loaded.")).toBeInTheDocument();
    expect(screen.getByText("Role 24")).toBeInTheDocument();
    expect(screen.queryByText("Role 25")).not.toBeInTheDocument();
    expect(screen.getByText("Reveal 29 more roles.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More..." }));

    expect(screen.getByText("Showing 53 of 53 matching roles from 53 loaded.")).toBeInTheDocument();
    expect(screen.getByText("Role 53")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More..." })).not.toBeInTheDocument();
  });

  it("filters roles by keyword and manual facets, then clears back to the loaded window", () => {
    const jobs: JobPostingDto[] = [
      {
        ...createJob(1),
        title: "Software Engineer, AI Systems",
        companyName: "Figma",
        location: "Remote",
        commitment: "Full-time",
        sourceLane: "ats_direct",
      },
      {
        ...createJob(2),
        title: "Computer Vision Engineer",
        companyName: "Stripe",
        location: "New York, NY",
        commitment: "Contract",
        sourceLane: "aggregator",
      },
      {
        ...createJob(3),
        title: "Gen AI Product Manager",
        companyName: "Anthropic",
        location: "Hybrid - Chicago, IL",
        commitment: "Full-time",
        sourceLane: "ats_direct",
      },
    ];

    render(<JobsResults jobs={jobs} />);

    fireEvent.change(screen.getByLabelText("Keyword"), {
      target: { value: "vision" },
    });

    expect(screen.getByText("Showing 1 of 1 matching role from 3 loaded.")).toBeInTheDocument();
    expect(screen.getByText("Computer Vision Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Software Engineer, AI Systems")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Workplace"), {
      target: { value: "remote" },
    });

    expect(screen.getByText("No roles match the current filters.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);

    expect(screen.getByText("Showing 3 of 3 matching roles from 3 loaded.")).toBeInTheDocument();
    expect(screen.getByText("Software Engineer, AI Systems")).toBeInTheDocument();
    expect(screen.getByText("Computer Vision Engineer")).toBeInTheDocument();
    expect(screen.getByText("Gen AI Product Manager")).toBeInTheDocument();
  });
});
