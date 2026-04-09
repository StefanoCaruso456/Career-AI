import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AgentBuilderWorkspace } from "@/components/agent-builder-workspace";
import { getCareerBuilderWorkspace } from "@/packages/career-builder-domain/src";

export const metadata: Metadata = {
  title: "Build and grow your Career ID",
  description:
    "Build and grow your Career ID with verified career evidence, trust tiers, and a structured credibility profile.",
};

export default async function AgentBuildPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/sign-in?callbackUrl=/agent-build");
  }

  const initialSnapshot = await getCareerBuilderWorkspace({
    viewer: {
      email: session.user.email,
      name: session.user.name,
    },
    correlationId: crypto.randomUUID(),
  });

  return <AgentBuilderWorkspace initialSnapshot={initialSnapshot} />;
}
