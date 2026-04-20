import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JobDetailsDto } from "@/packages/contracts/src";
import { JobDetailsModal } from "./job-details-modal";

function createDetails(
  overrides?: Partial<JobDetailsDto>,
): JobDetailsDto {
  return {
    company: "Accenture",
    contentStatus: "partial",
    descriptionHtml: null,
    descriptionText:
      "Um time que faz parte da mudanca. Abracamos o poder da mudanca para criar valor e sucesso compartilhado para nossos clientes, funcionarios, acionistas, parceiros e comunidades. Contamos com a maior rede mundial de centros de tecnologia avancada e operacoes inteligentes. Provocamos a mudanca no mercado. Trabalhamos juntos mundo afora para fazer um mundo de diferencas. A Accenture e uma empresa global de servicos profissionais lider em solucoes para digital, nuvem e seguranca.",
    employmentType: "Full-time",
    externalJobId: "REQ-1234",
    fallbackMessage:
      "Career AI is still pulling the full normalized description for in-app reading.",
    id: "job_1",
    location: "Sao Paulo, Brazil",
    metadata: null,
    postedAt: "2026-04-19T12:00:00.000Z",
    preferredQualifications: [],
    qualifications: [],
    responsibilities: [],
    salaryText: null,
    source: "workday",
    sourceLabel: "Accenture",
    sourceUrl: "https://jobs.example.com/job_1",
    summary:
      "Um time que faz parte da mudanca. Abracamos o poder da mudanca para criar valor e sucesso compartilhado.",
    title: "Analista Contabil Fiscal Senior",
    workplaceType: "hybrid",
    ...overrides,
  };
}

describe("JobDetailsModal", () => {
  it("splits long plain-text descriptions into readable paragraphs", async () => {
    render(
      <JobDetailsModal
        applyAction={<button type="button">Apply now</button>}
        details={createDetails()}
        isLoading={false}
        isOpen={true}
        onClose={() => {}}
      />,
    );

    await screen.findByRole("dialog", { name: "Analista Contabil Fiscal Senior" });

    const descriptionHeading = screen.getByRole("heading", { name: "Description" });
    const descriptionSection = descriptionHeading.closest("section");

    expect(descriptionSection).not.toBeNull();
    expect((descriptionSection as HTMLElement).querySelectorAll("p")).toHaveLength(2);
  });
});
