import type {
  ChatMessage,
  JobPostingDto,
  JobSearchFiltersDto,
  JobSearchQueryDto,
  JobSearchRetrievalResultDto,
  JobSeekerAgentTraceEntryDto,
  JobSeekerIntent,
  JobSeekerProfileContextDto,
  JobSeekerResultQuality,
  JobSeekerToolName,
  JobsPanelResponseDto,
} from "@/packages/contracts/src";
import type { JobSeekerRoutingDecision } from "./query-routing";
import type { SearchWebFreshness, SearchWebToolInput, SearchWebToolOutput } from "./tool-registry";

export type HomepageAssistantAttachment = {
  mimeType: string;
  name: string;
  size: number;
};

export type JobSeekerConversationMessage = Pick<ChatMessage, "content" | "role">;

export type SearchJobsToolInput = {
  conversationId: string | null;
  limit: number;
  ownerId: string | null;
  profileContext: JobSeekerProfileContextDto | null;
  prompt: string;
  query: JobSearchQueryDto;
  refresh: boolean;
};

export type BrowseLatestJobsToolInput = {
  conversationId: string | null;
  limit: number;
  ownerId: string | null;
  prompt: string;
  refresh: boolean;
};

export type GetJobByIdToolInput = {
  jobId: string;
};

export type FindSimilarJobsToolInput = {
  jobId: string;
  limit: number;
  ownerId: string | null;
  refresh: boolean;
};

export type GetUserCareerProfileToolInput = {
  ownerId: string | null;
};

export type JobSeekerToolInput =
  | BrowseLatestJobsToolInput
  | SearchJobsToolInput
  | GetJobByIdToolInput
  | FindSimilarJobsToolInput
  | GetUserCareerProfileToolInput
  | SearchWebToolInput
  | null;

export type JobSearchCatalogResult = JobSearchRetrievalResultDto;

export type JobSeekerToolResult =
  | JobSearchCatalogResult
  | JobPostingDto
  | JobSeekerProfileContextDto
  | SearchWebToolOutput
  | null;

export type JobSeekerAgentInput = {
  attachments?: HomepageAssistantAttachment[];
  conversationId?: string | null;
  limit?: number;
  messages: JobSeekerConversationMessage[];
  ownerId?: string | null;
  userQuery: string;
};

export type JobSeekerAgentResult = {
  assistantMessage: string;
  jobsPanel: JobsPanelResponseDto | null;
};

export type JobSeekerAgentState = {
  attachments: HomepageAssistantAttachment[];
  conversationId: string | null;
  debugTrace: JobSeekerAgentTraceEntryDto[];
  extractedFilters: JobSearchFiltersDto | null;
  intent: JobSeekerIntent | null;
  intentConfidence: number | null;
  lastSearchResult: JobSearchCatalogResult | null;
  lastToolKind: JobSeekerToolName | null;
  lastWebSearchResult: SearchWebToolOutput | null;
  loopCount: number;
  maxLoops: number;
  messages: JobSeekerConversationMessage[];
  normalizedQuery: string;
  normalizedToolResult: JobSeekerToolResult;
  ownerId: string | null;
  priorJobSearchQuery: string | null;
  profileContext: JobSeekerProfileContextDto | null;
  responsePayload: JobSeekerAgentResult | null;
  resultQuality: JobSeekerResultQuality | null;
  routingDecision: JobSeekerRoutingDecision | null;
  selectedTool: JobSeekerToolName | null;
  shouldTerminate: boolean;
  terminationReason: string | null;
  toolArgs: JobSeekerToolInput;
  toolResult: unknown;
  userQuery: string;
};

export type JobSeekerClassifierOutput = {
  confidence: number;
  extractedFilters: Partial<JobSearchFiltersDto> | null;
  intent: JobSeekerIntent;
};

export type JobSeekerPlannerOutput = {
  clarificationQuestion: string | null;
  effectivePrompt: string | null;
  filters: JobSearchFiltersDto | null;
  selectedTool: JobSeekerToolName | null;
  shouldUseProfileContext: boolean;
};

export type JobSeekerAgentModel = {
  classifyIntent(args: {
    messages: JobSeekerConversationMessage[];
    priorJobSearchQuery: string | null;
    profileContext: JobSeekerProfileContextDto | null;
    userQuery: string;
  }): Promise<JobSeekerClassifierOutput>;
  composeGeneralResponse(args: {
    attachments: HomepageAssistantAttachment[];
    intent: JobSeekerIntent;
    messages: JobSeekerConversationMessage[];
    profileContext: JobSeekerProfileContextDto | null;
    userQuery: string;
  }): Promise<string>;
  composeSearchResponse(args: {
    clarificationQuestion: string | null;
    jobs: JobPostingDto[];
    profileContext: JobSeekerProfileContextDto | null;
    query: JobSearchQueryDto;
    resultQuality: JobSeekerResultQuality;
    userQuery: string;
  }): Promise<string>;
  composeWebSearchResponse(args: {
    freshness: SearchWebFreshness;
    queryUsed: string;
    results: SearchWebToolOutput["results"];
    userQuery: string;
  }): Promise<string>;
  planAction(args: {
    intent: JobSeekerIntent;
    messages: JobSeekerConversationMessage[];
    priorJobSearchQuery: string | null;
    profileContext: JobSeekerProfileContextDto | null;
    userQuery: string;
  }): Promise<JobSeekerPlannerOutput>;
};

export type JobSeekerToolSet = {
  browseLatestJobs(input: BrowseLatestJobsToolInput): Promise<JobSearchCatalogResult>;
  findSimilarJobs(input: FindSimilarJobsToolInput): Promise<JobSearchCatalogResult | null>;
  getJobById(input: GetJobByIdToolInput): Promise<JobPostingDto | null>;
  getUserCareerProfile(input: GetUserCareerProfileToolInput): Promise<JobSeekerProfileContextDto | null>;
  searchWeb(input: SearchWebToolInput): Promise<SearchWebToolOutput>;
  searchJobs(input: SearchJobsToolInput): Promise<JobSearchCatalogResult>;
};
