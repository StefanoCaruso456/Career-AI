import { createLiveJobSeekerAgentModel } from "./model";
import { createJobSeekerAgent } from "./runtime";
import { createLiveJobSeekerToolSet } from "./tools";
import type { JobSeekerAgentInput } from "./types";

const liveJobSeekerAgent = createJobSeekerAgent({
  model: createLiveJobSeekerAgentModel(),
  tools: createLiveJobSeekerToolSet(),
});

export async function runJobSeekerAgent(input: JobSeekerAgentInput) {
  return liveJobSeekerAgent.invoke(input);
}
