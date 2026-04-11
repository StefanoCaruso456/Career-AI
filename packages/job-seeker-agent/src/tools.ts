import {
  findSimilarJobsCatalog,
  getJobPostingDetails,
  resolveJobSeekerProfileContext,
  searchJobsCatalog,
} from "@/packages/jobs-domain/src";
import type { JobSeekerToolSet } from "./types";

export function createLiveJobSeekerToolSet(): JobSeekerToolSet {
  return {
    async findSimilarJobs(input) {
      return findSimilarJobsCatalog({
        jobId: input.jobId,
        limit: input.limit,
        ownerId: input.ownerId,
        refresh: input.refresh,
      });
    },

    async getJobById(input) {
      return getJobPostingDetails({
        jobId: input.jobId,
      });
    },

    async getUserCareerProfile(input) {
      const profile = await resolveJobSeekerProfileContext(input.ownerId);

      if (!profile) {
        return null;
      }

      return {
        available: true,
        careerIdentityId: profile.careerIdentityId,
        headline: profile.headline,
        location: profile.location,
        signals: profile.signals,
        targetRole: profile.targetRole,
      };
    },

    async searchJobs(input) {
      return searchJobsCatalog({
        conversationId: input.conversationId,
        limit: input.limit,
        ownerId: input.ownerId,
        profileContext: input.profileContext,
        prompt: input.prompt,
        query: input.query,
        refresh: input.refresh,
      });
    },
  };
}
