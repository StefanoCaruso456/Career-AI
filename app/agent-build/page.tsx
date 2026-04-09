import type { Metadata } from "next";
import { AgentBuilderWorkspace } from "@/components/agent-builder-workspace";

export const metadata: Metadata = {
  title: "Career AI Agent Builder",
  description:
    "Build and grow your soul.md with verified career evidence, trust tiers, and a structured credibility profile.",
};

export default function AgentBuildPage() {
  return <AgentBuilderWorkspace />;
}
