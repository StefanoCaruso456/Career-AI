import type { Metadata } from "next";
import { AgentBuilderWorkspace } from "@/components/agent-builder-workspace";

export const metadata: Metadata = {
  title: "Build and grow your Career ID",
  description:
    "Build and grow your Career ID with verified career evidence, trust tiers, and a structured credibility profile.",
};

export default function AgentBuildPage() {
  return <AgentBuilderWorkspace />;
}
