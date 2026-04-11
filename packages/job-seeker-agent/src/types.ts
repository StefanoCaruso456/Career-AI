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
  | SearchJobsToolInput
  | GetJobByIdToolInput
  | FindSimilarJobsToolInput
  | GetUserCareerProfileToolInput
  | null;

export type JobSearchCatalogResult = JobSearchRetrievalResultDto;

export type JobSeekerToolResult =
  | JobSearchCatalogResult
  | JobPostingDto
  | JobSeekerProfileContextDto
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
  planAction(args: {
    intent: JobSeekerIntent;
    messages: JobSeekerConversationMessage[];
    priorJobSearchQuery: string | null;
    profileContext: JobSeekerProfileContextDto | null;
    userQuery: string;
  }): Promise<JobSeekerPlannerOutput>;
};

export type JobSeekerToolSet = {
  findSimilarJobs(input: FindSimilarJobsToolInput): Promise<JobSearchCatalogResult | null>;
  getJobById(input: GetJobByIdToolInput): Promise<JobPostingDto | null>;
  getUserCareerProfile(input: GetUserCareerProfileToolInput): Promise<JobSeekerProfileContextDto | null>;
  searchJobs(input: SearchJobsToolInput): Promise<JobSearchCatalogResult>;
};
