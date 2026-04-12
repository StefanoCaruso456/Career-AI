import { traceSpan } from "@/lib/tracing";
import { createLiveJobSeekerAgentModel } from "./model";
import { createJobSeekerAgent } from "./runtime";
import { createLiveJobSeekerToolSet } from "./tools";
import type { JobSeekerAgentInput } from "./types";

const liveJobSeekerAgent = createJobSeekerAgent({
  model: createLiveJobSeekerAgentModel(),
  tools: createLiveJobSeekerToolSet(),
});

export async function runJobSeekerAgent(input: JobSeekerAgentInput) {
  return traceSpan(
    {
      input: {
        attachment_count: input.attachments?.length ?? 0,
        conversation_id: input.conversationId ?? null,
        limit: input.limit ?? null,
        message_count: input.messages.length,
        owner_id: input.ownerId ?? null,
        user_query: input.userQuery,
      },
      metadata: {
        prompt_version: "job_seeker_agent.v1",
        workflow_id: "job_seeker_agent.run",
      },
      name: "workflow.job_seeker_agent.run",
      output: (result) => ({
        assistant_message_length: result.assistantMessage.length,
        has_jobs_panel: Boolean(result.jobsPanel),
        job_count: result.jobsPanel?.jobs.length ?? 0,
        output_preview: result.assistantMessage.slice(0, 160),
      }),
      tags: ["workflow:job_seeker_agent"],
      type: "task",
    },
    () => liveJobSeekerAgent.invoke(input),
  );
}
