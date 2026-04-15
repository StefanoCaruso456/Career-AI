import { withTracedRoute } from "@/lib/tracing";
import { handleExternalRecruiterAgentPost } from "./handler";

export const runtime = "nodejs";

export const POST = withTracedRoute(
  {
    name: "http.route.a2a.agents.recruiter.post",
    tags: ["route:a2a", "agent:recruiter"],
    type: "task",
  },
  handleExternalRecruiterAgentPost,
);
