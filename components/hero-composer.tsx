"use client";

import Link from "next/link";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Ellipsis,
  Folder,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  MessageSquareText,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Share2,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { AttachmentButton } from "@/components/attachment-button";
import { ChatMessageAttachments } from "@/components/chat-message-attachments";
import { EmployerCandidateDetailModal } from "@/components/employer/employer-candidate-detail-modal";
import { EmployerCandidateResultsRail } from "@/components/employer/employer-candidate-results-rail";
import { EmployerSourcerFilters } from "@/components/employer/employer-sourcer-filters";
import { FileUploadDropzone } from "@/components/file-upload-dropzone";
import { JobsSidePanel } from "@/components/jobs/jobs-side-panel";
import { PromptComposerAttachments } from "@/components/prompt-composer-attachments";
import { useChatAttachmentDrafts } from "@/components/use-chat-attachment-drafts";
import {
  landingContentByPersona,
  type HeroComposerAction,
  type HeroComposerContent,
} from "@/components/chat-home-shell-content";
import { isEmployerCandidateSearchIntent } from "@/lib/employer/is-candidate-search-intent";
import { loadEmployerCandidateMatches } from "@/lib/employer/load-candidate-matches";
import { isJobIntent } from "@/lib/jobs/is-job-intent";
import { loadJobListings } from "@/lib/jobs/load-job-listings";
import { loadLatestJobListings } from "@/lib/jobs/load-latest-job-listings";
import { mapJobsPanelToListings } from "@/lib/jobs/map-jobs-to-listings";
import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import type { Persona } from "@/lib/personas";
import {
  DEFAULT_LATEST_JOBS_PROMPT,
  type ChatConversation,
  type ChatProjectActivitySnapshot,
  type ChatProjectPersistence,
  type ChatMessage,
  type ChatProject,
  type EmployerCandidateMatchDto,
  type EmployerCandidateSearchFiltersDto,
  type EmployerCandidateSearchResponseDto,
  type JobsPanelResponseDto,
  type ChatWorkspacePersistence,
  type ChatWorkspaceSnapshot,
  emptyChatWorkspacePersistence,
  supportedChatAttachmentTypes,
} from "@/packages/contracts/src";
import {
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  startTransition,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./chat-home-shell.module.css";

type TranscriptEntry = ChatMessage;
type ProjectEntry = ChatProject;
type ChatThread = ChatConversation;
type ChatProjectPersistenceMap = Record<string, ChatProjectPersistence>;

type SidebarEntityType = "chat" | "project";

type SidebarActionMenu = {
  id: string;
  type: SidebarEntityType;
};

type SidebarRenameDraft = {
  id: string;
  type: SidebarEntityType;
  value: string;
};

type SidebarDeleteDraft =
  | {
      chatCount: number;
      id: string;
      label: string;
      type: "project";
    }
  | {
      id: string;
      label: string;
      type: "chat";
    };

type JobsAssistMode = "latest" | "search";

type TranscriptScrollIntent =
  | {
      mode: "anchor-entry";
      entryId: string;
    }
  | {
      mode: "bottom";
    }
  | {
      mode: "top";
    };

type SidebarNoticeTone = "default" | "error";

type SidebarNotice = {
  message: string;
  tone: SidebarNoticeTone;
};

type ComposerNoticeTone = "active" | "default" | "error";

type ComposerNotice = {
  message: string;
  tone: ComposerNoticeTone;
};

type ProjectActivityState = {
  error: string | null;
  isLoading: boolean;
  payload: ChatProjectActivitySnapshot | null;
  projectId: string | null;
  restoringCheckpointId: string | null;
};

type VoiceInputState = "idle" | "recording" | "transcribing";

type BrowserSpeechRecognitionAlternative = {
  transcript: string;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0: BrowserSpeechRecognitionAlternative;
  length: number;
};

type BrowserSpeechRecognitionEvent = Event & {
  results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognitionErrorEvent = Event & {
  error?: string;
  message?: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: ((event: Event) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type HeroComposerProps = {
  content?: HeroComposerContent;
  onConversationStateChange?: (active: boolean) => void;
  persona?: Persona;
};

type ChatSubmitTarget = {
  conversationId: string | null;
  projectId: string | null;
};

type VoiceEnabledWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

type ConversationComposerStyle = CSSProperties & {
  "--chat-composer-clearance": string;
  "--chat-conversation-composer-offset": string;
};

const preferredRecorderMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

const cancelledVoiceCaptureError = "__voice-capture-cancelled__";
const attachmentInputAccept = supportedChatAttachmentTypes
  .map((type) => `.${type.extension}`)
  .join(",");
const defaultEmployerCandidateSearchFilters: EmployerCandidateSearchFiltersDto = {
  certifications: [],
  credibilityThreshold: null,
  education: null,
  industry: null,
  location: null,
  priorEmployers: [],
  skills: [],
  verificationStatus: [],
  verifiedExperienceOnly: false,
  workAuthorization: null,
  yearsExperienceMin: null,
};

function mergeVoiceDraft(base: string, incoming: string) {
  const normalizedIncoming = incoming.replace(/\s+/g, " ").trim();

  if (!normalizedIncoming) {
    return base;
  }

  if (!base.trim()) {
    return normalizedIncoming;
  }

  return `${base.trimEnd()} ${normalizedIncoming}`;
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const voiceEnabledWindow = window as VoiceEnabledWindow;

  return voiceEnabledWindow.SpeechRecognition ?? voiceEnabledWindow.webkitSpeechRecognition ?? null;
}

function getRecorderMimeType() {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return "";
  }

  return preferredRecorderMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "";
}

function getAudioExtension(type: string) {
  if (type.includes("mp4")) {
    return ".m4a";
  }

  if (type.includes("ogg")) {
    return ".ogg";
  }

  if (type.includes("mpeg") || type.includes("mp3")) {
    return ".mp3";
  }

  if (type.includes("wav")) {
    return ".wav";
  }

  return ".webm";
}

function resolveChatSubmitTarget(args: {
  activeProjectId: string | null;
  currentThreadId: string | null;
  projectHomeProjectId: string | null;
  projects: ProjectEntry[];
  threads: ChatThread[];
}): ChatSubmitTarget {
  const currentThread = args.currentThreadId
    ? args.threads.find((thread) => thread.id === args.currentThreadId) ?? null
    : null;
  const currentThreadProjectIsAvailable =
    currentThread &&
    args.projects.some((project) => project.id === currentThread.projectId);

  if (currentThread && currentThreadProjectIsAvailable) {
    return {
      conversationId: currentThread.id,
      projectId: currentThread.projectId,
    };
  }

  if (
    args.activeProjectId &&
    args.projects.some((project) => project.id === args.activeProjectId)
  ) {
    return {
      conversationId: null,
      projectId: args.activeProjectId,
    };
  }

  if (
    args.projectHomeProjectId &&
    args.projects.some((project) => project.id === args.projectHomeProjectId)
  ) {
    return {
      conversationId: null,
      projectId: args.projectHomeProjectId,
    };
  }

  return {
    conversationId: null,
    projectId: null,
  };
}

function isRecoverableSendFailure(args: {
  errorCode?: string;
  message?: string;
  status: number;
}) {
  if (args.message === "Project was not found.") {
    return args.status === 404 || args.errorCode === "NOT_FOUND";
  }

  if (args.message === "Conversation is linked to a different project.") {
    return args.status === 409 || args.errorCode === "CONFLICT";
  }

  return false;
}

function getSpeechRecognitionErrorMessage(errorCode?: string) {
  switch (errorCode) {
    case "audio-capture":
      return "No microphone was available for live dictation.";
    case "network":
      return "The browser lost its connection to speech recognition. Try again.";
    case "no-speech":
      return "No speech was detected. Try again.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Enable it and try again.";
    default:
      return "Live dictation could not start right now.";
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getMicrophoneErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Microphone access is blocked. Enable it and try again.";
      case "NotFoundError":
        return "No microphone was found on this device.";
      case "NotReadableError":
        return "The microphone is already in use by another app.";
      default:
        return "The microphone could not start right now.";
    }
  }

  return "The microphone could not start right now.";
}

function buildTranscriptEntrySummary(entry: TranscriptEntry) {
  const normalizedContent = entry.content.replace(/\s+/g, " ").trim();

  if (normalizedContent) {
    return normalizedContent;
  }

  if (entry.attachments?.length) {
    return entry.attachments.length === 1
      ? `Attachment: ${entry.attachments[0].originalName}`
      : `Attachments: ${entry.attachments[0].originalName} +${entry.attachments.length - 1} more`;
  }

  return "";
}

function getSidebarEntityLabel(type: SidebarEntityType) {
  return type === "project" ? "project" : "chat";
}

function capitalizeLabel(label: string) {
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function buildThreadPreview(thread: ChatThread) {
  const firstNarrativeEntry = thread.messages.find((entry) => entry.role === "user");
  const fallbackEntry = thread.messages[thread.messages.length - 1];
  const previewSource =
    (firstNarrativeEntry ? buildTranscriptEntrySummary(firstNarrativeEntry) : "") ||
    (fallbackEntry ? buildTranscriptEntrySummary(fallbackEntry) : "") ||
    "Start a new chat in this project.";
  const normalizedPreview = previewSource.replace(/\s+/g, " ").trim();

  if (normalizedPreview.length <= 96) {
    return normalizedPreview;
  }

  return `${normalizedPreview.slice(0, 93)}...`;
}

function getLatestJobPrompt(entries: TranscriptEntry[]) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry.role === "user" && entry.content.trim() && isJobIntent(entry.content)) {
      return entry.content.trim();
    }
  }

  return null;
}

function getLatestCandidatePrompt(entries: TranscriptEntry[]) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry.role === "user" && entry.content.trim() && isEmployerCandidateSearchIntent(entry.content)) {
      return entry.content.trim();
    }
  }

  return null;
}

function createJobsAssistRequestKey(mode: JobsAssistMode, prompt: string, refreshKey: number) {
  return `${mode}::${prompt}::${refreshKey}`;
}

function deriveJobsAssistMode(prompt: string | null) {
  if (!prompt) {
    return null;
  }

  return prompt.trim().toLowerCase() === DEFAULT_LATEST_JOBS_PROMPT.toLowerCase()
    ? "latest"
    : "search";
}

function serializeEmployerFilters(filters: EmployerCandidateSearchFiltersDto) {
  return JSON.stringify({
    ...filters,
    title: filters.title ?? null,
  });
}

function hasEmployerSearchFilters(filters: EmployerCandidateSearchFiltersDto) {
  return Boolean(
    filters.title?.trim() ||
      filters.skills.length > 0 ||
      filters.yearsExperienceMin !== null ||
      filters.industry?.trim() ||
      filters.location?.trim() ||
      filters.workAuthorization?.trim() ||
      filters.education?.trim() ||
      filters.credibilityThreshold !== null ||
      filters.verificationStatus.length > 0 ||
      filters.priorEmployers.length > 0 ||
      filters.certifications.length > 0 ||
      filters.verifiedExperienceOnly,
  );
}

function getCredibilityThresholdLabel(threshold: number | null) {
  if (threshold === null) {
    return null;
  }

  if (threshold >= 0.85) {
    return "very high confidence";
  }

  if (threshold >= 0.7) {
    return "high credibility";
  }

  return "evidence-backed";
}

function buildEmployerSourcingBrief(filters: EmployerCandidateSearchFiltersDto) {
  if (!hasEmployerSearchFilters(filters)) {
    return "";
  }

  const clauses: string[] = [];

  if (filters.title?.trim()) {
    clauses.push(`for a ${filters.title.trim()} role`);
  }

  if (filters.location?.trim()) {
    clauses.push(`in ${filters.location.trim()}`);
  }

  if (filters.skills.length > 0) {
    clauses.push(`with ${filters.skills.join(", ")}`);
  }

  if (filters.industry?.trim()) {
    clauses.push(`with ${filters.industry.trim()} industry background`);
  }

  if (filters.yearsExperienceMin !== null) {
    clauses.push(`with at least ${filters.yearsExperienceMin} years of experience`);
  }

  if (filters.workAuthorization?.trim()) {
    clauses.push(`with ${filters.workAuthorization.trim()} work authorization`);
  }

  if (filters.education?.trim()) {
    clauses.push(`with ${filters.education.trim()} education background`);
  }

  if (filters.priorEmployers.length > 0) {
    clauses.push(`from employers like ${filters.priorEmployers.join(", ")}`);
  }

  if (filters.certifications.length > 0) {
    clauses.push(`with certifications such as ${filters.certifications.join(", ")}`);
  }

  const followUps: string[] = [];

  if (filters.verifiedExperienceOnly) {
    followUps.push("Prioritize candidates with verified experience signals only.");
  }

  const credibilityLabel = getCredibilityThresholdLabel(filters.credibilityThreshold);

  if (credibilityLabel) {
    followUps.push(`Focus on ${credibilityLabel} candidates.`);
  }

  if (filters.verificationStatus.length > 0) {
    followUps.push(
      `Match candidates with ${filters.verificationStatus.join(", ").replaceAll("_", " ")} signals.`,
    );
  }

  const opening = `Find aligned candidates${clauses.length > 0 ? ` ${clauses.join(" ")}` : ""}.`;

  return [opening, ...followUps].join(" ").trim();
}

function formatThreadUpdatedAt(updatedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(updatedAt));
}

function createClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `request_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatRelativeTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return "Not saved yet";
  }

  const diffMs = Date.now() - new Date(timestamp).getTime();
  const safeDiffMs = Math.max(diffMs, 0);
  const minutes = Math.floor(safeDiffMs / (60 * 1000));
  const hours = Math.floor(safeDiffMs / (60 * 60 * 1000));
  const days = Math.floor(safeDiffMs / (24 * 60 * 60 * 1000));

  if (minutes <= 0) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${days}d ago`;
}

export function HeroComposer({
  content,
  onConversationStateChange,
  persona = "job_seeker",
}: HeroComposerProps) {
  const composerContent = content ?? landingContentByPersona.job_seeker.heroComposer;
  const starterActions = composerContent.starterActions;
  const isEmployerMode = persona === "employer";
  const sidebarId = useId();
  const deleteDialogTitleId = `${sidebarId}-delete-dialog-title`;
  const deleteDialogDescriptionId = `${sidebarId}-delete-dialog-description`;
  const [message, setMessage] = useState("");
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [projectHomeProjectId, setProjectHomeProjectId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [workspacePersistence, setWorkspacePersistence] =
    useState<ChatWorkspacePersistence>(emptyChatWorkspacePersistence);
  const [projectPersistence, setProjectPersistence] =
    useState<ChatProjectPersistenceMap>({});
  const [isMounted, setIsMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [voiceInputState, setVoiceInputState] = useState<VoiceInputState>("idle");
  const [voiceNotice, setVoiceNotice] = useState<ComposerNotice | null>(null);
  const [composerNotice, setComposerNotice] = useState<ComposerNotice | null>(null);
  const [sidebarActionMenu, setSidebarActionMenu] = useState<SidebarActionMenu | null>(null);
  const [sidebarRenameDraft, setSidebarRenameDraft] = useState<SidebarRenameDraft | null>(null);
  const [sidebarDeleteDraft, setSidebarDeleteDraft] = useState<SidebarDeleteDraft | null>(null);
  const [sidebarNotice, setSidebarNotice] = useState<SidebarNotice | null>(null);
  const [isEmployerFiltersOpen, setIsEmployerFiltersOpen] = useState(false);
  const [candidateSearchFilters, setCandidateSearchFilters] =
    useState<EmployerCandidateSearchFiltersDto>(defaultEmployerCandidateSearchFilters);
  const [candidateAssistResponse, setCandidateAssistResponse] =
    useState<EmployerCandidateSearchResponseDto | null>(null);
  const [candidateAssistError, setCandidateAssistError] = useState<string | null>(null);
  const [candidateAssistListings, setCandidateAssistListings] = useState<
    EmployerCandidateMatchDto[]
  >([]);
  const [isCandidateAssistLoading, setIsCandidateAssistLoading] = useState(false);
  const [candidateAssistLoadedRequestKey, setCandidateAssistLoadedRequestKey] =
    useState<string | null>(null);
  const [candidateAssistRefreshKey, setCandidateAssistRefreshKey] = useState(0);
  const [jobsAssistListings, setJobsAssistListings] = useState<JobListing[]>([]);
  const [jobsAssistEmptyState, setJobsAssistEmptyState] = useState<string | null>(null);
  const [jobsAssistError, setJobsAssistError] = useState<string | null>(null);
  const [isJobsAssistLoading, setIsJobsAssistLoading] = useState(false);
  const [jobsAssistLoadedRequestKey, setJobsAssistLoadedRequestKey] = useState<string | null>(null);
  const [jobsAssistRefreshKey, setJobsAssistRefreshKey] = useState(0);
  const [selectedCandidateDetail, setSelectedCandidateDetail] =
    useState<EmployerCandidateMatchDto | null>(null);
  const [shortlistedCandidateIds, setShortlistedCandidateIds] = useState<string[]>([]);
  const [projectActivityState, setProjectActivityState] = useState<ProjectActivityState>({
    error: null,
    isLoading: false,
    payload: null,
    projectId: null,
    restoringCheckpointId: null,
  });
  const [isCheckpointSaving, setIsCheckpointSaving] = useState(false);
  const {
    addFiles,
    attachments: pendingAttachments,
    clearAttachments,
    clearSelectionError,
    detachAttachments,
    removeAttachment,
    releaseDetachedAttachments,
    restoreAttachments,
    retryAttachment,
    selectionError,
  } = useChatAttachmentDrafts();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const composerDockRef = useRef<HTMLFormElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const sidebarRenameInputRef = useRef<HTMLInputElement>(null);
  const sidebarDeleteCancelButtonRef = useRef<HTMLButtonElement>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const voiceSeedMessageRef = useRef("");
  const voiceDraftRef = useRef("");
  const voiceCaptureErrorRef = useRef<string | null>(null);
  const transcriptScrollIntentRef = useRef<TranscriptScrollIntent | null>(null);

  const isRecording = voiceInputState === "recording";
  const isTranscribing = voiceInputState === "transcribing";
  const isComposerInputDisabled = isWorkspaceLoading || isRecording || isTranscribing;
  const hasEmployerStructuredSearchDraft =
    isEmployerMode &&
    isEmployerFiltersOpen &&
    hasEmployerSearchFilters(candidateSearchFilters) &&
    message.trim().length === 0;
  const hasBlockedAttachments = pendingAttachments.some((attachment) =>
    ["failed", "pending", "uploading"].includes(attachment.uploadStatus),
  );
  const canSubmit =
    (message.trim().length > 0 ||
      pendingAttachments.length > 0 ||
      hasEmployerStructuredSearchDraft) &&
    !isSubmitting &&
    !isWorkspaceLoading &&
    !isRecording &&
    !isTranscribing &&
    !hasBlockedAttachments;
  const activeComposerNotice =
    voiceNotice?.tone === "active" ? voiceNotice : composerNotice ?? voiceNotice;
  const workspaceVisible = true;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeProjectPersistence = activeProjectId
    ? projectPersistence[activeProjectId] ?? null
    : null;
  const activeProjectThreads = activeProject ? getProjectThreads(activeProject.id) : [];
  const isProjectHomeVisible =
    activeProject !== null &&
    currentThreadId === null &&
    projectHomeProjectId === activeProject.id;
  const latestCandidatePrompt =
    isEmployerMode && !isProjectHomeVisible ? getLatestCandidatePrompt(transcript) : null;
  const latestJobPrompt =
    !isEmployerMode && !isProjectHomeVisible ? getLatestJobPrompt(transcript) : null;
  const jobsAssistMode =
    !isEmployerMode && !isProjectHomeVisible
      ? deriveJobsAssistMode(latestJobPrompt)
      : null;
  const jobsAssistPrompt =
    jobsAssistMode ? latestJobPrompt : null;
  const candidateAssistFiltersKey = serializeEmployerFilters(candidateSearchFilters);
  const candidateAssistRequestKey = latestCandidatePrompt
    ? `${latestCandidatePrompt}::${candidateAssistFiltersKey}::${candidateAssistRefreshKey}`
    : null;
  const jobsAssistRequestKey =
    jobsAssistMode && jobsAssistPrompt
      ? createJobsAssistRequestKey(jobsAssistMode, jobsAssistPrompt, jobsAssistRefreshKey)
      : null;
  const isCandidateAssistVisible = Boolean(latestCandidatePrompt);
  const isJobsAssistVisible = Boolean(jobsAssistMode && jobsAssistPrompt);
  const isAssistRailVisible = isEmployerMode ? isCandidateAssistVisible : isJobsAssistVisible;
  const hasActiveConversation = !isProjectHomeVisible && (transcript.length > 0 || isSubmitting);
  const isLandingState = !hasActiveConversation && !isProjectHomeVisible;
  const [conversationComposerStyle, setConversationComposerStyle] =
    useState<ConversationComposerStyle | null>(null);
  const activeComposerPlaceholder =
    isEmployerMode && isEmployerFiltersOpen
      ? composerContent.expandedComposerPlaceholder ?? composerContent.composerPlaceholder
      : composerContent.composerPlaceholder;
  const isEmployerFiltersApplyDisabled =
    !message.trim() && !hasEmployerSearchFilters(candidateSearchFilters);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    onConversationStateChange?.(hasActiveConversation);
  }, [hasActiveConversation, onConversationStateChange]);

  useEffect(() => {
    if (!latestCandidatePrompt) {
      setCandidateAssistError(null);
      setCandidateAssistListings([]);
      setCandidateAssistLoadedRequestKey(null);
      setCandidateAssistResponse(null);
      setIsCandidateAssistLoading(false);
      return;
    }

    if (candidateAssistLoadedRequestKey === candidateAssistRequestKey) {
      return;
    }

    const abortController = new AbortController();

    setIsCandidateAssistLoading(true);
    setCandidateAssistError(null);

    void loadEmployerCandidateMatches({
      conversationId: currentThreadId,
      filters: candidateSearchFilters,
      limit: 6,
      prompt: latestCandidatePrompt,
      refresh: candidateAssistRefreshKey > 0,
      signal: abortController.signal,
    })
      .then((result) => {
        startTransition(() => {
          setCandidateAssistListings(result.candidates);
          setCandidateAssistResponse(result);
          setCandidateAssistError(null);
          setCandidateAssistLoadedRequestKey(candidateAssistRequestKey);
          setIsCandidateAssistLoading(false);
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        setCandidateAssistError(
          error instanceof Error
            ? error.message
            : "Unable to load recruiter candidate results.",
        );
        setIsCandidateAssistLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [
    candidateAssistLoadedRequestKey,
    candidateAssistRefreshKey,
    candidateAssistRequestKey,
    candidateSearchFilters,
    currentThreadId,
    latestCandidatePrompt,
  ]);

  useEffect(() => {
    if (!jobsAssistMode || !jobsAssistPrompt) {
      setIsJobsAssistLoading(false);
      setJobsAssistEmptyState(null);
      setJobsAssistError(null);
      setJobsAssistListings([]);
      setJobsAssistLoadedRequestKey(null);
      return;
    }

    if (jobsAssistLoadedRequestKey === jobsAssistRequestKey) {
      return;
    }

    const abortController = new AbortController();

    setIsJobsAssistLoading(true);
    setJobsAssistEmptyState(null);
    setJobsAssistError(null);
    const loadRequest =
      jobsAssistMode === "latest"
        ? loadLatestJobListings({
            conversationId: currentThreadId,
            limit: 6,
            refresh: jobsAssistRefreshKey > 0,
            signal: abortController.signal,
          })
        : loadJobListings({
            conversationId: currentThreadId,
            limit: 6,
            prompt: jobsAssistPrompt,
            refresh: jobsAssistRefreshKey > 0,
            signal: abortController.signal,
          });

    void loadRequest
      .then((result) => {
        startTransition(() => {
          setJobsAssistListings(result.listings);
          setJobsAssistEmptyState(result.rail.emptyState);
          setJobsAssistError(null);
          setJobsAssistLoadedRequestKey(jobsAssistRequestKey);
          setIsJobsAssistLoading(false);
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        setJobsAssistEmptyState(null);
        setJobsAssistError(
          error instanceof Error
            ? error.message
            : jobsAssistMode === "latest"
              ? "Latest jobs could not be loaded right now."
              : "Jobs could not be loaded right now.",
        );
        setIsJobsAssistLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [
    currentThreadId,
    jobsAssistLoadedRequestKey,
    jobsAssistMode,
    jobsAssistPrompt,
    jobsAssistRequestKey,
    jobsAssistRefreshKey,
  ]);

  useLayoutEffect(() => {
    const transcriptNode = transcriptRef.current;
    const scrollIntent = transcriptScrollIntentRef.current;

    if (!transcriptNode || !scrollIntent) {
      return;
    }

    if (scrollIntent.mode === "top") {
      transcriptNode.scrollTo({
        behavior: "auto",
        top: 0,
      });
      transcriptScrollIntentRef.current = null;
      return;
    }

    if (scrollIntent.mode === "bottom") {
      transcriptNode.scrollTo({
        behavior: "smooth",
        top: transcriptNode.scrollHeight,
      });
      transcriptScrollIntentRef.current = null;
      return;
    }

    const entrySelector =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(scrollIntent.entryId)
        : scrollIntent.entryId.replace(/"/g, '\\"');
    const anchoredEntry = transcriptNode.querySelector<HTMLElement>(
      `[data-transcript-entry-id="${entrySelector}"]`,
    );

    if (!anchoredEntry) {
      return;
    }

    transcriptNode.scrollTo({
      behavior: "auto",
      top: Math.max(anchoredEntry.offsetTop - 24, 0),
    });
    transcriptScrollIntentRef.current = null;
  }, [transcript]);

  useLayoutEffect(() => {
    if (!hasActiveConversation) {
      setConversationComposerStyle(null);
      return;
    }

    const composerDockNode = composerDockRef.current;

    if (!composerDockNode) {
      return;
    }

    const updateConversationComposerStyle = () => {
      const composerHeight = composerDockNode.getBoundingClientRect().height;
      const nextClearance = `${Math.ceil(composerHeight + 28)}px`;
      const nextStyle: ConversationComposerStyle = {
        "--chat-composer-clearance": nextClearance,
        "--chat-conversation-composer-offset": "0px",
      };

      setConversationComposerStyle((currentStyle) => {
        const currentClearance = currentStyle?.["--chat-composer-clearance"];
        const currentOffset = currentStyle?.["--chat-conversation-composer-offset"];

        if (currentClearance === nextClearance && currentOffset === "0px") {
          return currentStyle;
        }

        return nextStyle;
      });
    };

    updateConversationComposerStyle();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateConversationComposerStyle();
    });

    resizeObserver.observe(composerDockNode);

    return () => {
      resizeObserver.disconnect();
    };
  }, [hasActiveConversation]);

  useEffect(() => {
    return () => {
      voiceCaptureErrorRef.current = cancelledVoiceCaptureError;
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.onerror = null;
        mediaRecorderRef.current.stop();
      }

      mediaRecorderRef.current = null;
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!sidebarNotice) {
      return;
    }

    const noticeTimeout = window.setTimeout(() => {
      setSidebarNotice(null);
    }, 2400);

    return () => {
      window.clearTimeout(noticeTimeout);
    };
  }, [sidebarNotice]);

  useEffect(() => {
    if (!sidebarRenameDraft) {
      return;
    }

    window.requestAnimationFrame(() => {
      sidebarRenameInputRef.current?.focus();
      sidebarRenameInputRef.current?.select();
    });
  }, [sidebarRenameDraft]);

  useEffect(() => {
    if (!sidebarDeleteDraft) {
      return;
    }

    function handleDeleteEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSidebarDeleteDraft(null);
      }
    }

    const originalOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => {
      sidebarDeleteCancelButtonRef.current?.focus();
    });

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleDeleteEscape);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleDeleteEscape);
    };
  }, [sidebarDeleteDraft]);

  useEffect(() => {
    if (!sidebarActionMenu && !sidebarRenameDraft) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        setSidebarActionMenu(null);
        setSidebarRenameDraft(null);
        return;
      }

      const activeShell = target.closest("[data-sidebar-item-shell='true']");
      const activeEntityId = activeShell?.getAttribute("data-entity-id");
      const activeEntityType = activeShell?.getAttribute("data-entity-type");

      const clickedInsideOpenMenu =
        sidebarActionMenu &&
        activeEntityId === sidebarActionMenu.id &&
        activeEntityType === sidebarActionMenu.type;
      const clickedInsideRename =
        sidebarRenameDraft &&
        activeEntityId === sidebarRenameDraft.id &&
        activeEntityType === sidebarRenameDraft.type;

      if (clickedInsideOpenMenu || clickedInsideRename) {
        return;
      }

      setSidebarActionMenu(null);
      setSidebarRenameDraft(null);
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setSidebarActionMenu(null);
      setSidebarRenameDraft(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [sidebarActionMenu, sidebarRenameDraft]);

  function applyWorkspaceSnapshot(
    snapshot: ChatWorkspaceSnapshot,
    options?: {
      idleView?: "neutral" | "preserve" | "project-home";
      preferredConversationId?: string | null;
      preferredProjectId?: string | null;
    },
  ) {
    const nextProjects = snapshot.projects;
    const nextThreads = snapshot.conversations;
    const preferredConversationId = options?.preferredConversationId ?? currentThreadId;
    const preferredProjectId = options?.preferredProjectId ?? activeProjectId;
    const nextConversation =
      (preferredConversationId
        ? nextThreads.find((thread) => thread.id === preferredConversationId)
        : null) ?? null;
    const nextProjectId =
      nextConversation?.projectId ??
      (preferredProjectId && nextProjects.some((project) => project.id === preferredProjectId)
        ? preferredProjectId
        : nextProjects[0]?.id ?? null);

    setProjects(nextProjects);
    setThreads(nextThreads);
    setWorkspacePersistence(snapshot.persistence ?? emptyChatWorkspacePersistence);
    setProjectPersistence(snapshot.projectPersistence ?? {});
    setActiveProjectId(nextProjectId);
    setComposerNotice(null);

    if (nextConversation) {
      setCurrentThreadId(nextConversation.id);
      setProjectHomeProjectId(null);
      setTranscript(nextConversation.messages);
      return;
    }

    const idleView = options?.idleView ?? "preserve";
    const preservedProjectHomeId =
      projectHomeProjectId && nextProjects.some((project) => project.id === projectHomeProjectId)
        ? projectHomeProjectId
        : null;
    const nextProjectHomeId =
      idleView === "project-home"
        ? nextProjectId
        : idleView === "preserve"
          ? preservedProjectHomeId
          : null;

    setCurrentThreadId(null);
    setProjectHomeProjectId(nextProjectHomeId);
    setTranscript([]);
  }

  function replaceConversation(nextConversation: ChatConversation) {
    setThreads((currentThreads) => [
      nextConversation,
      ...currentThreads.filter((thread) => thread.id !== nextConversation.id),
    ]);
    setActiveProjectId(nextConversation.projectId);
    setCurrentThreadId(nextConversation.id);
    setProjectHomeProjectId(null);
    setTranscript(nextConversation.messages);
  }

  async function loadWorkspaceSnapshot(options?: {
    idleView?: "neutral" | "preserve" | "project-home";
    preferredConversationId?: string | null;
    preferredProjectId?: string | null;
  }) {
    const snapshot = await requestWorkspaceSnapshot("/api/chat/state", {
      method: "GET",
    });

    applyWorkspaceSnapshot(snapshot, options);
  }

  async function requestWorkspaceSnapshot(input: string, init: RequestInit) {
    const response = await fetch(input, init);
    const payload = (await response.json()) as ChatWorkspaceSnapshot & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Chat history could not be loaded right now.");
    }

    return payload;
  }

  function showComposerError(message: string) {
    setComposerNotice({ message, tone: "error" });
    setSidebarNotice({ message, tone: "error" });
  }

  async function recoverSubmitTargetFromWorkspace(): Promise<ChatSubmitTarget> {
    const snapshot = await requestWorkspaceSnapshot("/api/chat/state", {
      method: "GET",
    });
    const recoveredConversation = currentThreadId
      ? snapshot.conversations.find((thread) => thread.id === currentThreadId) ?? null
      : null;
    const recoveredProjectId =
      recoveredConversation?.projectId ??
      (projectHomeProjectId &&
      snapshot.projects.some((project) => project.id === projectHomeProjectId)
        ? projectHomeProjectId
        : snapshot.projects[0]?.id ?? null);

    applyWorkspaceSnapshot(snapshot, {
      idleView: projectHomeProjectId ? "project-home" : "neutral",
      preferredConversationId: recoveredConversation?.id ?? null,
      preferredProjectId: recoveredProjectId,
    });

    return {
      conversationId: recoveredConversation?.id ?? null,
      projectId: recoveredProjectId,
    };
  }

  async function ensureSubmitTargetForMessage(options?: {
    forceRefresh?: boolean;
  }): Promise<ChatSubmitTarget> {
    if (!options?.forceRefresh) {
      const localTarget = resolveChatSubmitTarget({
        activeProjectId,
        currentThreadId,
        projectHomeProjectId,
        projects,
        threads,
      });

      if (localTarget.projectId) {
        return localTarget;
      }
    }

    let latestErrorMessage: string | null = null;

    try {
      const recoveredTarget = await recoverSubmitTargetFromWorkspace();

      if (recoveredTarget.projectId) {
        return recoveredTarget;
      }

      latestErrorMessage = "Your chat workspace is still starting up. Try again.";
    } catch (error) {
      latestErrorMessage = getErrorMessage(
        error,
        "Chat history could not be loaded right now.",
      );
    }

    try {
      const snapshot = await requestWorkspaceSnapshot("/api/chat/projects", {
        body: JSON.stringify({}),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const recoveredProjectId =
        snapshot.projects[snapshot.projects.length - 1]?.id ?? snapshot.projects[0]?.id ?? null;

      applyWorkspaceSnapshot(snapshot, {
        preferredConversationId: null,
        preferredProjectId: recoveredProjectId,
      });

      if (recoveredProjectId) {
        return {
          conversationId: null,
          projectId: recoveredProjectId,
        };
      }

      latestErrorMessage = "Project could not be created right now.";
    } catch (error) {
      latestErrorMessage = getErrorMessage(
        error,
        "Project could not be created right now.",
      );
    }

    showComposerError(
      latestErrorMessage ?? "Your chat workspace is still starting up. Try again.",
    );
    return {
      conversationId: null,
      projectId: null,
    };
  }

  async function requestChatReply(args: {
    attachmentIds: string[];
    candidateSearchFilters?: EmployerCandidateSearchFiltersDto;
    clientRequestId: string;
    conversationId: string | null;
    message: string;
    persona: Persona;
    projectId: string;
    traceId: string;
  }) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": args.clientRequestId,
        "x-trace-id": args.traceId,
      },
      body: JSON.stringify({
        attachmentIds: args.attachmentIds,
        candidateSearchFilters: args.candidateSearchFilters,
        clientRequestId: args.clientRequestId,
        conversationId: args.conversationId,
        message: args.message,
        persona: args.persona,
        projectId: args.projectId,
      }),
    });

    const payload = (await response.json()) as {
      assistantMessage?: ChatMessage;
      candidatePanel?: EmployerCandidateSearchResponseDto | null;
      conversation?: ChatConversation;
      error?: string;
      errorCode?: string;
      jobsPanel?: JobsPanelResponseDto | null;
      userMessage?: ChatMessage;
      workspace?: ChatWorkspaceSnapshot;
    };

    return {
      ok: response.ok && Boolean(payload.conversation) && Boolean(payload.userMessage),
      payload,
      status: response.status,
    };
  }

  async function requestLatestJobsBrowse(args: {
    clientRequestId: string;
    conversationId: string | null;
    projectId: string;
    traceId: string;
  }) {
    const response = await fetch("/api/chat/latest-jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": args.clientRequestId,
        "x-trace-id": args.traceId,
      },
      body: JSON.stringify({
        clientRequestId: args.clientRequestId,
        conversationId: args.conversationId,
        projectId: args.projectId,
      }),
    });

    const payload = (await response.json()) as {
      assistantMessage?: ChatMessage;
      conversation?: ChatConversation;
      error?: string;
      errorCode?: string;
      jobsPanel?: JobsPanelResponseDto | null;
      userMessage?: ChatMessage;
      workspace?: ChatWorkspaceSnapshot;
    };

    return {
      ok: response.ok && Boolean(payload.conversation) && Boolean(payload.userMessage) && Boolean(payload.jobsPanel),
      payload,
      status: response.status,
    };
  }

  function applyCandidateAssistResponse(
    candidatePanel: EmployerCandidateSearchResponseDto | null | undefined,
  ) {
    if (!candidatePanel) {
      return;
    }

    setCandidateAssistListings(candidatePanel.candidates);
    setCandidateAssistResponse(candidatePanel);
    setCandidateAssistLoadedRequestKey(
      `${candidatePanel.query.prompt}::${serializeEmployerFilters(candidatePanel.query.filters)}::${candidateAssistRefreshKey}`,
    );
    setCandidateAssistError(null);
    setIsCandidateAssistLoading(false);
  }

  function applyJobsAssistResponse(
    jobsPanel: JobsPanelResponseDto | null | undefined,
  ) {
    if (!jobsPanel) {
      return;
    }

    const jobsMode = deriveJobsAssistMode(jobsPanel.query.prompt) ?? "search";
    setJobsAssistListings(mapJobsPanelToListings(jobsPanel));
    setJobsAssistEmptyState(jobsPanel.rail.emptyState);
    setJobsAssistLoadedRequestKey(
      createJobsAssistRequestKey(jobsMode, jobsPanel.query.prompt, jobsAssistRefreshKey),
    );
    setJobsAssistError(null);
    setIsJobsAssistLoading(false);
  }

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      try {
        await loadWorkspaceSnapshot({ idleView: "neutral" });
      } catch (error) {
        if (!isCancelled) {
          showComposerError(
            getErrorMessage(error, "Chat history could not be loaded right now."),
          );
        }
      } finally {
        if (!isCancelled) {
          setIsWorkspaceLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  function focusComposer() {
    window.requestAnimationFrame(() => {
      const input = composerInputRef.current;

      if (!input) {
        return;
      }

      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  function stopRecordingStream() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  function cancelVoiceCapture() {
    voiceCaptureErrorRef.current = cancelledVoiceCaptureError;
    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = null;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.onerror = null;
      mediaRecorderRef.current.stop();
    }

    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    voiceDraftRef.current = "";
    stopRecordingStream();
    setVoiceInputState("idle");
    setVoiceNotice(null);
  }

  async function requestVoiceTranscription(audioBlob: Blob) {
    const formData = new FormData();
    const normalizedType = audioBlob.type || "audio/webm";
    const audioFile = new File([audioBlob], `voice-note${getAudioExtension(normalizedType)}`, {
      type: normalizedType,
    });

    formData.set("file", audioFile);

    const response = await fetch("/api/chat/transcribe", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as { error?: string; transcript?: string };

    if (!response.ok || !payload.transcript) {
      throw new Error(payload.error || "The voice note could not be transcribed.");
    }

    return payload.transcript;
  }

  async function finalizeRecordedAudio() {
    const audioType = mediaRecorderRef.current?.mimeType || recordedChunksRef.current[0]?.type || "audio/webm";
    const audioBlob = new Blob(recordedChunksRef.current, { type: audioType });

    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];

    if (audioBlob.size === 0) {
      setVoiceInputState("idle");
      setVoiceNotice({
        message: "That recording was empty. Try speaking again.",
        tone: "error",
      });
      return;
    }

    try {
      const nextTranscript = await requestVoiceTranscription(audioBlob);
      const nextMessage = mergeVoiceDraft(voiceSeedMessageRef.current, nextTranscript);

      setMessage(nextMessage);
      setVoiceNotice({
        message: "Voice note added to your draft.",
        tone: "default",
      });
      focusComposer();
    } catch (error) {
      setMessage(voiceSeedMessageRef.current);
      setVoiceNotice({
        message:
          error instanceof Error
            ? error.message
            : "The voice note could not be transcribed right now.",
        tone: "error",
      });
    } finally {
      setVoiceInputState("idle");
    }
  }

  function startSpeechRecognition(
    SpeechRecognitionConstructor: BrowserSpeechRecognitionConstructor,
  ) {
    const recognition = new SpeechRecognitionConstructor();

    voiceSeedMessageRef.current = message;
    voiceDraftRef.current = "";
    voiceCaptureErrorRef.current = null;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let nextDraft = "";

      for (let resultIndex = 0; resultIndex < event.results.length; resultIndex += 1) {
        const result = event.results[resultIndex];
        const snippet = result[0]?.transcript ?? "";

        if (!snippet) {
          continue;
        }

        nextDraft = `${nextDraft} ${snippet}`.trim();
      }

      voiceDraftRef.current = nextDraft;
      setMessage(mergeVoiceDraft(voiceSeedMessageRef.current, nextDraft));
    };

    recognition.onerror = (event) => {
      const nextErrorMessage = getSpeechRecognitionErrorMessage(event.error);

      voiceCaptureErrorRef.current = nextErrorMessage;
      speechRecognitionRef.current = null;
      setVoiceInputState("idle");
      setVoiceNotice({ message: nextErrorMessage, tone: "error" });
    };

    recognition.onend = () => {
      speechRecognitionRef.current = null;

      const nextErrorMessage = voiceCaptureErrorRef.current;
      voiceCaptureErrorRef.current = null;

      if (nextErrorMessage === cancelledVoiceCaptureError) {
        return;
      }

      setVoiceInputState("idle");

      if (nextErrorMessage) {
        setVoiceNotice({ message: nextErrorMessage, tone: "error" });
        return;
      }

      if (!voiceDraftRef.current.trim()) {
        setMessage(voiceSeedMessageRef.current);
        setVoiceNotice({
          message: "No speech was detected. Try again.",
          tone: "error",
        });
        return;
      }

      setVoiceNotice({
        message: "Voice note added to your draft.",
        tone: "default",
      });
      focusComposer();
    };

    recognition.start();
    speechRecognitionRef.current = recognition;
    setVoiceInputState("recording");
    setVoiceNotice({
      message: "Listening live. Click the mic again when you're done.",
      tone: "active",
    });
  }

  async function startAudioCaptureFallback() {
    if (
      typeof MediaRecorder === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setVoiceNotice({
        message: "Voice dictation is not supported in this browser.",
        tone: "error",
      });
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getRecorderMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    voiceSeedMessageRef.current = message;
    voiceDraftRef.current = "";
    voiceCaptureErrorRef.current = null;
    recordedChunksRef.current = [];
    recordingStreamRef.current = stream;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      mediaRecorderRef.current = null;
      stopRecordingStream();
      setVoiceInputState("idle");
      setVoiceNotice({
        message: "The microphone recording failed. Try again.",
        tone: "error",
      });
    };

    recorder.onstop = () => {
      void finalizeRecordedAudio();
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setVoiceInputState("recording");
    setVoiceNotice({
      message: "Recording voice note. Click the mic again to transcribe it.",
      tone: "active",
    });
  }

  async function startVoiceInput() {
    setVoiceNotice(null);

    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();

    if (SpeechRecognitionConstructor) {
      try {
        startSpeechRecognition(SpeechRecognitionConstructor);
        return;
      } catch {
        // Fall through to the server-backed recording path.
      }
    }

    try {
      await startAudioCaptureFallback();
    } catch (error) {
      setVoiceInputState("idle");
      setVoiceNotice({
        message: getMicrophoneErrorMessage(error),
        tone: "error",
      });
    }
  }

  function stopVoiceInput() {
    if (speechRecognitionRef.current) {
      setVoiceNotice({
        message: "Wrapping up your dictation...",
        tone: "active",
      });
      speechRecognitionRef.current.stop();
      return;
    }

    if (mediaRecorderRef.current) {
      setVoiceInputState("transcribing");
      setVoiceNotice({
        message: "Transcribing your voice note...",
        tone: "active",
      });
      mediaRecorderRef.current.stop();
      stopRecordingStream();
    }
  }

  async function handleVoiceInputToggle() {
    if (isSubmitting || isTranscribing) {
      return;
    }

    if (isRecording) {
      stopVoiceInput();
      return;
    }

    await startVoiceInput();
  }

  function openThread(thread: ChatThread) {
    cancelVoiceCapture();
    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setProjectHomeProjectId(null);
    setActiveProjectId(thread.projectId);
    setCurrentThreadId(thread.id);
    transcriptScrollIntentRef.current = { mode: "top" };
    void clearAttachments();
    clearSelectionError();
    setTranscript(thread.messages);
    setMessage("");
    setSidebarOpen(true);
  }

  function handleNewChat() {
    cancelVoiceCapture();
    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setProjectHomeProjectId(activeProjectId);
    setCurrentThreadId(null);
    transcriptScrollIntentRef.current = { mode: "top" };
    setTranscript([]);
    void clearAttachments();
    clearSelectionError();
    setMessage("");
    setSidebarOpen(true);
    focusComposer();
  }

  function handleProjectSelect(projectId: string) {
    const isProjectAlreadyOpen =
      activeProjectId === projectId &&
      currentThreadId === null &&
      projectHomeProjectId === projectId;

    cancelVoiceCapture();
    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setActiveProjectId(projectId);
    setProjectHomeProjectId(projectId);
    setSidebarOpen(true);

    if (isProjectAlreadyOpen) {
      focusComposer();
      return;
    }

    setCurrentThreadId(null);
    transcriptScrollIntentRef.current = { mode: "top" };
    setTranscript([]);
    void clearAttachments();
    clearSelectionError();
    setMessage("");
    focusComposer();
  }

  async function handleNewProject() {
    cancelVoiceCapture();
    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setSidebarOpen(true);

    try {
      const existingProjectIds = new Set(projects.map((project) => project.id));
      const snapshot = await requestWorkspaceSnapshot("/api/chat/projects", {
        body: JSON.stringify({}),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const nextProject =
        snapshot.projects.find((project) => !existingProjectIds.has(project.id)) ??
        snapshot.projects[snapshot.projects.length - 1] ??
        null;

      transcriptScrollIntentRef.current = { mode: "top" };
      await clearAttachments();
      clearSelectionError();
      setMessage("");
      applyWorkspaceSnapshot(snapshot, {
        preferredConversationId: null,
        preferredProjectId: nextProject?.id ?? null,
      });
      focusComposer();
    } catch (error) {
      showComposerError(getErrorMessage(error, "Project could not be created right now."));
    }
  }

  async function submitMessage(nextMessage?: string) {
    const explicitPrompt = (nextMessage ?? message).trim();
    const derivedEmployerPrompt =
      !explicitPrompt && isEmployerMode && hasEmployerSearchFilters(candidateSearchFilters)
        ? buildEmployerSourcingBrief(candidateSearchFilters)
        : "";
    const prompt = explicitPrompt || derivedEmployerPrompt;
    const readyAttachments = pendingAttachments.filter(
      (attachment) => attachment.uploadStatus === "uploaded" && attachment.attachmentId,
    );

    if ((!prompt && readyAttachments.length === 0) || isSubmitting || hasBlockedAttachments) {
      return;
    }

    setComposerNotice(null);
    setIsSubmitting(true);

    const submitTarget = await ensureSubmitTargetForMessage();

    if (!submitTarget.projectId) {
      if (nextMessage) {
        setMessage(prompt);
      }
      focusComposer();
      setIsSubmitting(false);
      return;
    }

    const previousTranscript = transcript;
    const previousProjectHomeProjectId = projectHomeProjectId;
    const previousCurrentThreadId = currentThreadId;
    const detachedAttachments = detachAttachments();
    const optimisticUserMessage: TranscriptEntry = {
      attachments: readyAttachments.map((attachment) => ({
        createdAt: new Date().toISOString(),
        downloadUrl: attachment.downloadUrl ?? attachment.openUrl ?? "#",
        extension: attachment.extension,
        id: attachment.attachmentId ?? attachment.localId,
        messageId: null,
        mimeType: attachment.mimeType,
        openUrl: attachment.openUrl ?? attachment.previewUrl ?? "#",
        originalName: attachment.originalName,
        previewKind: attachment.previewKind,
        sizeBytes: attachment.sizeBytes,
        status: "uploaded",
        thumbnailUrl: attachment.thumbnailUrl ?? attachment.previewUrl,
        updatedAt: new Date().toISOString(),
      })),
      content: prompt,
      createdAt: new Date().toISOString(),
      id: `pending_message_${Date.now()}`,
      role: "user",
    };

    setProjectHomeProjectId(null);
    if (isEmployerMode && isEmployerFiltersOpen) {
      setIsEmployerFiltersOpen(false);
    }
    transcriptScrollIntentRef.current = { mode: "bottom" };
    setTranscript([...transcript, optimisticUserMessage]);
    clearSelectionError();
    setMessage("");

    try {
      const attachmentIds = readyAttachments
        .map((attachment) => attachment.attachmentId)
        .filter((attachmentId): attachmentId is string => Boolean(attachmentId));
      const clientRequestId = createClientRequestId();
      const traceId = createClientRequestId();
      let reply = await requestChatReply({
        attachmentIds,
        candidateSearchFilters: isEmployerMode ? candidateSearchFilters : undefined,
        clientRequestId,
        conversationId: submitTarget.conversationId,
        message: prompt,
        persona,
        projectId: submitTarget.projectId,
        traceId,
      });
      let payload = reply.payload;

      if (
        !reply.ok &&
        isRecoverableSendFailure({
          errorCode: payload.errorCode,
          message: payload.error,
          status: reply.status,
        })
      ) {
        const recoveredSubmitTarget = await ensureSubmitTargetForMessage({
          forceRefresh: true,
        });

        if (recoveredSubmitTarget.projectId) {
          reply = await requestChatReply({
            attachmentIds,
            candidateSearchFilters: isEmployerMode ? candidateSearchFilters : undefined,
            clientRequestId,
            conversationId: recoveredSubmitTarget.conversationId,
            message: prompt,
            persona,
            projectId: recoveredSubmitTarget.projectId,
            traceId,
          });
          payload = reply.payload;
        }
      }

      if (!reply.ok || !payload.conversation || !payload.userMessage) {
        throw new Error(payload.error || "The assistant could not respond.");
      }

      const { conversation, userMessage } = payload;

      releaseDetachedAttachments(detachedAttachments);

      startTransition(() => {
        applyCandidateAssistResponse(payload.candidatePanel);
        applyJobsAssistResponse(payload.jobsPanel);
        transcriptScrollIntentRef.current = {
          entryId: userMessage.id,
          mode: "anchor-entry",
        };
        if (payload.workspace) {
          applyWorkspaceSnapshot(payload.workspace, {
            preferredConversationId: conversation.id,
            preferredProjectId: conversation.projectId,
          });
        } else {
          replaceConversation(conversation);
        }
      });
    } catch (requestError) {
      setTranscript(previousTranscript);
      setProjectHomeProjectId(previousProjectHomeProjectId);
      setCurrentThreadId(previousCurrentThreadId);
      restoreAttachments(detachedAttachments);
      setMessage(prompt);
      showComposerError(getErrorMessage(requestError, "The assistant could not respond."));

      if (nextMessage) {
        setMessage(prompt);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage();
  }

  async function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    if (isSubmitting || isComposerInputDisabled) {
      return;
    }

    event.preventDefault();
    await submitMessage();
  }

  function handleMessageChange(nextMessage: string) {
    setMessage(nextMessage);
    setComposerNotice(null);

    if (voiceNotice?.tone === "error") {
      setVoiceNotice(null);
    }
  }

  function handleAttachmentSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    addFiles(files);
    event.target.value = "";
  }

  function handleAttachmentRemove(attachmentId: string) {
    void removeAttachment(attachmentId);
  }

  function handleOpenEmployerFilters() {
    setIsEmployerFiltersOpen(true);
    setComposerNotice({
      message: "Add structured recruiter signals, then use the brief or send the search directly.",
      tone: "default",
    });
  }

  function handleCancelEmployerFilters() {
    setIsEmployerFiltersOpen(false);
    setComposerNotice(null);
    focusComposer();
  }

  function handleApplyEmployerFilters() {
    const typedMessage = message.trim();
    const generatedBrief = buildEmployerSourcingBrief(candidateSearchFilters);

    if (!typedMessage && !generatedBrief) {
      setComposerNotice({
        message: "Add a title, skill, location, or recruiter brief before using the sourcing brief.",
        tone: "error",
      });
      return;
    }

    if (!typedMessage && generatedBrief) {
      setMessage(generatedBrief);
    }

    setIsEmployerFiltersOpen(false);
    setComposerNotice({
      message: typedMessage
        ? "Structured filters are ready for your next candidate search."
        : "Sourcing brief added to the composer. Review it, then send when ready.",
      tone: "default",
    });
    focusComposer();
  }

  function handleStarterAction(action: HeroComposerAction) {
    if (action.kind === "filters") {
      handleOpenEmployerFilters();
      return;
    }

    if (action.kind === "latest_jobs") {
      setIsEmployerFiltersOpen(false);
      void handleLatestJobsStarter();
      return;
    }

    if (action.kind !== "prompt") {
      return;
    }

    setIsEmployerFiltersOpen(false);
    void submitMessage(action.value ?? action.label);
  }

  async function handleLatestJobsStarter() {
    if (isSubmitting) {
      return;
    }

    setComposerNotice(null);
    setIsSubmitting(true);

    try {
      const submitTarget = await ensureSubmitTargetForMessage();

      if (!submitTarget.projectId) {
        focusComposer();
        return;
      }

      const clientRequestId = createClientRequestId();
      const traceId = createClientRequestId();
      const reply = await requestLatestJobsBrowse({
        clientRequestId,
        conversationId: submitTarget.conversationId,
        projectId: submitTarget.projectId,
        traceId,
      });
      const payload = reply.payload;

      if (!reply.ok || !payload.conversation || !payload.userMessage || !payload.jobsPanel) {
        throw new Error(payload.error || "Latest jobs could not be loaded right now.");
      }

      const { conversation, jobsPanel, userMessage, workspace } = payload;

      startTransition(() => {
        applyJobsAssistResponse(jobsPanel);
        transcriptScrollIntentRef.current = {
          entryId: userMessage.id,
          mode: "anchor-entry",
        };
        if (workspace) {
          applyWorkspaceSnapshot(workspace, {
            preferredConversationId: conversation.id,
            preferredProjectId: conversation.projectId,
          });
        } else {
          replaceConversation(conversation);
        }
      });
    } catch (error) {
      showComposerError(
        getErrorMessage(error, "Latest jobs could not be loaded right now."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenCandidateDetail(candidate: EmployerCandidateMatchDto) {
    setSelectedCandidateDetail(candidate);
  }

  function closeCandidateDetail() {
    setSelectedCandidateDetail(null);
  }

  function handleShortlistCandidate(candidate: EmployerCandidateMatchDto) {
    setShortlistedCandidateIds((currentIds) => {
      const alreadyShortlisted = currentIds.includes(candidate.candidateId);
      const nextIds = alreadyShortlisted
        ? currentIds.filter((candidateId) => candidateId !== candidate.candidateId)
        : [...currentIds, candidate.candidateId];

      setComposerNotice({
        message: alreadyShortlisted
          ? `${candidate.fullName} removed from shortlist.`
          : `${candidate.fullName} added to shortlist.`,
        tone: "default",
      });

      return nextIds;
    });
  }

  async function handleApplyJob(job: JobListing) {
    try {
      const response = await fetch("/api/v1/jobs/apply-click", {
        body: JSON.stringify({
          canonicalApplyUrl: job.canonicalApplyUrl,
          conversationId: currentThreadId,
          jobId: job.id,
          metadata: {
            isOrchestrationReady: job.isOrchestrationReady,
            sourceLabel: job.sourceLabel,
            validationStatus: job.validationStatus ?? null,
          },
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as {
        applyUrl?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.applyUrl) {
        throw new Error(payload.error || "The application link could not be opened.");
      }

      window.open(payload.applyUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      showComposerError(
        error instanceof Error ? error.message : "The application link could not be opened.",
      );
    }
  }

  async function handleSaveCheckpoint() {
    if (!activeProjectId || isCheckpointSaving) {
      return;
    }

    setIsCheckpointSaving(true);
    setComposerNotice(null);

    try {
      const response = await fetch(`/api/chat/projects/${activeProjectId}/checkpoints`, {
        body: JSON.stringify({
          conversationId: currentThreadId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        workspace?: ChatWorkspaceSnapshot;
      };

      if (!response.ok || !payload.workspace) {
        throw new Error(payload.error || "Checkpoint could not be saved right now.");
      }

      applyWorkspaceSnapshot(payload.workspace, {
        preferredConversationId: currentThreadId,
        preferredProjectId: activeProjectId,
      });
      setComposerNotice({
        message: "Checkpoint saved.",
        tone: "default",
      });
    } catch (error) {
      showComposerError(getErrorMessage(error, "Checkpoint could not be saved right now."));
    } finally {
      setIsCheckpointSaving(false);
    }
  }

  async function openProjectActivityHistory() {
    if (!activeProjectId) {
      return;
    }

    setProjectActivityState({
      error: null,
      isLoading: true,
      payload: null,
      projectId: activeProjectId,
      restoringCheckpointId: null,
    });

    try {
      const response = await fetch(`/api/chat/projects/${activeProjectId}/activity`, {
        method: "GET",
      });
      const payload = (await response.json()) as ChatProjectActivitySnapshot & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Project activity could not be loaded right now.");
      }

      setProjectActivityState({
        error: null,
        isLoading: false,
        payload,
        projectId: activeProjectId,
        restoringCheckpointId: null,
      });
    } catch (error) {
      setProjectActivityState({
        error: getErrorMessage(error, "Project activity could not be loaded right now."),
        isLoading: false,
        payload: null,
        projectId: activeProjectId,
        restoringCheckpointId: null,
      });
    }
  }

  function closeProjectActivityHistory() {
    setProjectActivityState({
      error: null,
      isLoading: false,
      payload: null,
      projectId: null,
      restoringCheckpointId: null,
    });
  }

  async function restoreCheckpointFromActivity(checkpointId: string) {
    if (!projectActivityState.projectId) {
      return;
    }

    setProjectActivityState((currentState) => ({
      ...currentState,
      restoringCheckpointId: checkpointId,
    }));

    try {
      const response = await fetch(`/api/chat/checkpoints/${checkpointId}/restore`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        workspace?: ChatWorkspaceSnapshot;
      };

      if (!response.ok || !payload.workspace) {
        throw new Error(payload.error || "Checkpoint could not be restored right now.");
      }

      applyWorkspaceSnapshot(payload.workspace, {
        preferredConversationId: currentThreadId,
        preferredProjectId: projectActivityState.projectId,
      });
      closeProjectActivityHistory();
      setComposerNotice({
        message: "Checkpoint restored.",
        tone: "default",
      });
    } catch (error) {
      setProjectActivityState((currentState) => ({
        ...currentState,
        error: getErrorMessage(error, "Checkpoint could not be restored right now."),
        restoringCheckpointId: null,
      }));
    }
  }

  function toggleSidebarActionMenu(type: SidebarEntityType, id: string) {
    setSidebarRenameDraft(null);
    setSidebarActionMenu((currentMenu) =>
      currentMenu?.id === id && currentMenu.type === type ? null : { id, type },
    );
  }

  function beginSidebarRename(type: SidebarEntityType, id: string, currentLabel: string) {
    setSidebarNotice(null);
    setSidebarActionMenu(null);
    setSidebarRenameDraft({ id, type, value: currentLabel });
  }

  function handleSidebarRenameValueChange(value: string) {
    setSidebarRenameDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            value,
          }
        : currentDraft,
    );
  }

  function cancelSidebarRename() {
    setSidebarRenameDraft(null);
  }

  async function submitSidebarRename() {
    if (!sidebarRenameDraft) {
      return;
    }

    const normalizedLabel = sidebarRenameDraft.value.replace(/\s+/g, " ").trim();
    const entityLabel = getSidebarEntityLabel(sidebarRenameDraft.type);

    if (!normalizedLabel) {
      setSidebarNotice({
        message: `Add a ${entityLabel} name before saving.`,
        tone: "error",
      });
      return;
    }

    try {
      const snapshot = await requestWorkspaceSnapshot(
        sidebarRenameDraft.type === "project"
          ? `/api/chat/projects/${sidebarRenameDraft.id}`
          : `/api/chat/conversations/${sidebarRenameDraft.id}`,
        {
          body: JSON.stringify({ label: normalizedLabel }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "PATCH",
        },
      );

      applyWorkspaceSnapshot(snapshot);
      setSidebarRenameDraft(null);
      setSidebarNotice({
        message: `${capitalizeLabel(entityLabel)} renamed.`,
        tone: "default",
      });
    } catch (error) {
      setSidebarNotice({
        message:
          error instanceof Error
            ? error.message
            : `${capitalizeLabel(entityLabel)} could not be renamed right now.`,
        tone: "error",
      });
    }
  }

  async function handleSidebarShare(type: SidebarEntityType, id: string) {
    const entityLabel = getSidebarEntityLabel(type);
    const item =
      type === "project"
        ? projects.find((project) => project.id === id)
        : threads.find((thread) => thread.id === id);

    if (!item || typeof window === "undefined") {
      return;
    }

    const shareUrl = window.location.href;
    const shareTitle = item.label;
    const shareText = `Career AI ${entityLabel}: ${item.label}`;

    setSidebarActionMenu(null);

    try {
      if (navigator.share) {
        await navigator.share({
          text: shareText,
          title: shareTitle,
          url: shareUrl,
        });
        setSidebarNotice({
          message: `${capitalizeLabel(entityLabel)} shared.`,
          tone: "default",
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setSidebarNotice({
          message: `${capitalizeLabel(entityLabel)} link copied.`,
          tone: "default",
        });
        return;
      }

      throw new Error("Sharing is not supported in this browser.");
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") {
        return;
      }

      setSidebarNotice({
        message:
          shareError instanceof Error
            ? shareError.message
            : `The ${entityLabel} could not be shared right now.`,
        tone: "error",
      });
    }
  }

  async function handleProjectDelete(projectId: string) {
    const project = projects.find((currentProject) => currentProject.id === projectId);

    if (!project) {
      return;
    }

    cancelVoiceCapture();
    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setSidebarDeleteDraft(null);
    const isDeletedProjectActive =
      activeProjectId === projectId || projectHomeProjectId === projectId;

    try {
      const snapshot = await requestWorkspaceSnapshot(`/api/chat/projects/${projectId}`, {
        method: "DELETE",
      });

      if (isDeletedProjectActive) {
        transcriptScrollIntentRef.current = { mode: "top" };
        await clearAttachments();
        clearSelectionError();
        setMessage("");
      }

      applyWorkspaceSnapshot(snapshot, {
        preferredConversationId: currentThreadId,
        preferredProjectId: activeProjectId === projectId ? null : activeProjectId,
      });
      setSidebarNotice({
        message: "Project deleted.",
        tone: "default",
      });
    } catch (error) {
      setSidebarNotice({
        message: error instanceof Error ? error.message : "Project could not be deleted right now.",
        tone: "error",
      });
    }
  }

  async function handleChatDelete(chatId: string) {
    const chat = threads.find((currentChat) => currentChat.id === chatId);

    if (!chat) {
      return;
    }

    cancelVoiceCapture();
    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setSidebarDeleteDraft(null);

    try {
      const snapshot = await requestWorkspaceSnapshot(`/api/chat/conversations/${chatId}`, {
        method: "DELETE",
      });

      if (currentThreadId === chatId) {
        transcriptScrollIntentRef.current = { mode: "top" };
        await clearAttachments();
        clearSelectionError();
        setMessage("");
      }

      applyWorkspaceSnapshot(snapshot, {
        preferredConversationId: currentThreadId === chatId ? null : currentThreadId,
        preferredProjectId: chat.projectId,
      });
      setSidebarNotice({
        message: "Chat deleted.",
        tone: "default",
      });
    } catch (error) {
      setSidebarNotice({
        message: error instanceof Error ? error.message : "Chat could not be deleted right now.",
        tone: "error",
      });
    }
  }

  function requestProjectDelete(projectId: string) {
    const project = projects.find((currentProject) => currentProject.id === projectId);

    if (!project) {
      return;
    }

    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setSidebarDeleteDraft({
      chatCount: threads.filter((thread) => thread.projectId === project.id).length,
      id: project.id,
      label: project.label,
      type: "project",
    });
  }

  function requestChatDelete(chatId: string) {
    const chat = threads.find((currentChat) => currentChat.id === chatId);

    if (!chat) {
      return;
    }

    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setSidebarDeleteDraft({
      id: chat.id,
      label: chat.label,
      type: "chat",
    });
  }

  function closeSidebarDeleteDialog() {
    setSidebarDeleteDraft(null);
  }

  function confirmSidebarDelete() {
    if (!sidebarDeleteDraft) {
      return;
    }

    if (sidebarDeleteDraft.type === "project") {
      void handleProjectDelete(sidebarDeleteDraft.id);
      return;
    }

    void handleChatDelete(sidebarDeleteDraft.id);
  }

  function getProjectThreads(projectId: string) {
    return threads.filter((thread) => thread.projectId === projectId);
  }

  function renderComposer(placeholder: string, className?: string) {
    return (
      <FileUploadDropzone
        disabled={isSubmitting || isWorkspaceLoading || isRecording || isTranscribing}
        error={selectionError}
        onFilesDropped={addFiles}
      >
        <form
          className={[styles.composerDock, className ?? ""].filter(Boolean).join(" ")}
          onSubmit={handleSubmit}
          ref={composerDockRef}
        >
          <input
            accept={attachmentInputAccept}
            className={styles.hiddenAttachmentInput}
            multiple
            onChange={handleAttachmentSelection}
            ref={attachmentInputRef}
            tabIndex={-1}
            type="file"
          />
          {isEmployerMode && isEmployerFiltersOpen ? (
            <EmployerSourcerFilters
              autoFocusTitle
              filters={candidateSearchFilters}
              isApplyDisabled={isEmployerFiltersApplyDisabled}
              onApply={handleApplyEmployerFilters}
              onCancel={handleCancelEmployerFilters}
              onChange={setCandidateSearchFilters}
            />
          ) : null}
          <div className={styles.composerTop}>
            <textarea
              aria-label="Message composer"
              aria-describedby={activeComposerNotice ? "hero-composer-status" : undefined}
              className={styles.composerInput}
              disabled={isComposerInputDisabled}
              onChange={(event) => handleMessageChange(event.target.value)}
              onKeyDown={(event) => {
                void handleKeyDown(event);
              }}
              placeholder={
                isWorkspaceLoading
                  ? "Loading your chat workspace..."
                  : isRecording
                    ? "Listening to your voice note..."
                    : isTranscribing
                      ? "Transcribing your voice note..."
                      : placeholder
              }
              ref={composerInputRef}
              rows={3}
              value={message}
            />
          </div>

          {activeComposerNotice ? (
            <div aria-live="polite" className={styles.composerMeta} id="hero-composer-status">
              <p
                className={[
                  styles.composerStatus,
                  activeComposerNotice.tone === "active"
                    ? styles.composerStatusActive
                    : activeComposerNotice.tone === "error"
                      ? styles.composerStatusError
                      : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {activeComposerNotice.message}
              </p>
            </div>
          ) : null}

          <PromptComposerAttachments
            attachments={pendingAttachments}
            onRemove={handleAttachmentRemove}
            onRetry={retryAttachment}
          />

          <div className={styles.composerFooter}>
            <div className={styles.composerStart}>
              <AttachmentButton
                className={styles.iconCircle}
                onClick={() => {
                  clearSelectionError();
                  attachmentInputRef.current?.click();
                }}
              />
            </div>

            <div className={styles.composerEnd}>
              <button
                aria-label={
                  isRecording
                    ? "Stop voice input"
                    : isTranscribing
                      ? "Transcribing voice input"
                      : "Start voice input"
                }
                aria-pressed={isRecording}
                className={[
                  styles.iconGhost,
                  isRecording ? styles.iconGhostActive : "",
                  isTranscribing ? styles.iconGhostBusy : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={isSubmitting || isWorkspaceLoading || isTranscribing}
                onClick={() => {
                  void handleVoiceInputToggle();
                }}
                type="button"
              >
                {isTranscribing ? (
                  <LoaderCircle className={styles.spinner} size={16} strokeWidth={1.9} />
                ) : isRecording ? (
                  <Square size={14} strokeWidth={2.2} />
                ) : (
                  <Mic size={16} strokeWidth={1.9} />
                )}
              </button>
              <button
                aria-label={isSubmitting ? "Generating reply" : "Send message"}
                className={styles.voiceButton}
                disabled={!canSubmit}
                type="submit"
              >
                {isSubmitting ? (
                  <LoaderCircle className={styles.spinner} size={18} strokeWidth={2.1} />
                ) : (
                  <ArrowUp size={18} strokeWidth={2.4} />
                )}
              </button>
            </div>
          </div>
        </form>
      </FileUploadDropzone>
    );
  }

  function renderPersistenceBar() {
    if (
      !activeProject ||
      (workspacePersistence.lastSavedAt === null &&
        workspacePersistence.checkpointCount === 0 &&
        workspacePersistence.pendingMemoryJobs === 0)
    ) {
      return null;
    }

    const lastSavedLabel = formatRelativeTimestamp(
      activeProjectPersistence?.lastSavedAt ?? workspacePersistence.lastSavedAt,
    );
    const lastCheckpointLabel = formatRelativeTimestamp(
      activeProjectPersistence?.lastCheckpointAt ?? workspacePersistence.lastCheckpointAt,
    );

    return (
      <div className={styles.persistenceBar}>
        <div className={styles.persistenceMeta}>
          <span className={styles.persistenceChip}>Saved {lastSavedLabel}</span>
          <span className={styles.persistenceChip}>Last checkpoint {lastCheckpointLabel}</span>
        </div>
        <div className={styles.persistenceActions}>
          <button
            className={styles.persistenceAction}
            disabled={isCheckpointSaving}
            onClick={() => {
              void handleSaveCheckpoint();
            }}
            type="button"
          >
            {isCheckpointSaving ? "Saving checkpoint..." : "Save checkpoint"}
          </button>
          <button
            className={styles.persistenceAction}
            onClick={() => {
              void openProjectActivityHistory();
            }}
            type="button"
          >
            Activity history
          </button>
        </div>
      </div>
    );
  }

  function renderSidebarItemRow({
    itemClassName,
    labelClassName,
    leadingVisual,
    trailingVisual,
    id,
    isActive,
    label,
    onDelete,
    onSelect,
    shellClassName,
    type,
  }: {
    itemClassName?: string;
    labelClassName?: string;
    leadingVisual?: ReactNode;
    trailingVisual?: ReactNode;
    id: string;
    isActive: boolean;
    label: string;
    onDelete: () => void;
    onSelect: () => void;
    shellClassName?: string;
    type: SidebarEntityType;
  }) {
    const isMenuOpen = sidebarActionMenu?.id === id && sidebarActionMenu.type === type;
    const isRenaming = sidebarRenameDraft?.id === id && sidebarRenameDraft.type === type;
    const entityLabel = getSidebarEntityLabel(type);
    const menuId = `${sidebarId}-${type}-${id}-menu`;

    return (
      <div
        className={[styles.chatSidebarItemShell, shellClassName ?? ""].filter(Boolean).join(" ")}
        data-entity-id={id}
        data-entity-type={type}
        data-sidebar-item-shell="true"
      >
        {isRenaming ? (
          <form
            className={styles.chatSidebarRenameForm}
            onSubmit={(event) => {
              event.preventDefault();
              void submitSidebarRename();
            }}
          >
            <input
              aria-label={`Rename ${entityLabel}`}
              className={styles.chatSidebarRenameInput}
              onChange={(event) => handleSidebarRenameValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelSidebarRename();
                }
              }}
              ref={sidebarRenameInputRef}
              type="text"
              value={sidebarRenameDraft?.value ?? ""}
            />
            <div className={styles.chatSidebarRenameActions}>
              <button
                aria-label={`Save ${entityLabel} name`}
                className={[
                  styles.chatSidebarRenameAction,
                  styles.chatSidebarRenameActionConfirm,
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="submit"
              >
                <Check aria-hidden="true" size={14} strokeWidth={2.1} />
              </button>
              <button
                aria-label={`Cancel renaming ${entityLabel}`}
                className={[
                  styles.chatSidebarRenameAction,
                  styles.chatSidebarRenameActionCancel,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={cancelSidebarRename}
                type="button"
              >
                <X aria-hidden="true" size={14} strokeWidth={2.1} />
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.chatSidebarItemRow}>
            <button
              className={[
                styles.chatSidebarItem,
                styles.chatSidebarItemButton,
                itemClassName ?? "",
                isActive ? styles.chatSidebarItemActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={onSelect}
              type="button"
            >
              <span className={styles.chatSidebarItemContent}>
                {leadingVisual ? (
                  <span className={styles.chatSidebarItemLeading}>{leadingVisual}</span>
                ) : null}
                <span
                  className={[styles.chatSidebarItemLabel, labelClassName ?? ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {label}
                </span>
                {trailingVisual ? (
                  <span className={styles.chatSidebarItemAdornment}>{trailingVisual}</span>
                ) : null}
              </span>
            </button>
            <button
              aria-controls={menuId}
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
              aria-label={`${capitalizeLabel(entityLabel)} actions`}
              className={[
                styles.chatSidebarItemMenuTrigger,
                isMenuOpen ? styles.chatSidebarItemMenuTriggerVisible : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => toggleSidebarActionMenu(type, id)}
              type="button"
            >
              <Ellipsis aria-hidden="true" size={16} strokeWidth={2.1} />
            </button>

            {isMenuOpen ? (
              <div
                className={styles.chatSidebarItemMenu}
                id={menuId}
                role="menu"
                aria-label={`${capitalizeLabel(entityLabel)} actions`}
              >
                <button
                  className={styles.chatSidebarItemMenuAction}
                  onClick={() => void handleSidebarShare(type, id)}
                  role="menuitem"
                  type="button"
                >
                  <Share2 aria-hidden="true" size={16} strokeWidth={1.9} />
                  <span>Share</span>
                </button>
                <button
                  className={styles.chatSidebarItemMenuAction}
                  onClick={() => beginSidebarRename(type, id, label)}
                  role="menuitem"
                  type="button"
                >
                  <Pencil aria-hidden="true" size={16} strokeWidth={1.9} />
                  <span>{`Rename ${entityLabel}`}</span>
                </button>
                <div className={styles.chatSidebarItemMenuDivider} />
                <button
                  className={[
                    styles.chatSidebarItemMenuAction,
                    styles.chatSidebarItemMenuDanger,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={onDelete}
                  role="menuitem"
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} strokeWidth={1.9} />
                  <span>{`Delete ${entityLabel}`}</span>
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  function renderProjectRow(project: ProjectEntry) {
    const projectChats = getProjectThreads(project.id);
    const isActiveProject = project.id === activeProjectId;

    return (
      <li className={styles.chatSidebarProjectGroup} key={project.id}>
        {renderSidebarItemRow({
          id: project.id,
          isActive: isActiveProject,
          itemClassName: styles.chatSidebarProjectItem,
          label: project.label,
          leadingVisual: isActiveProject ? (
            <span className={styles.chatSidebarFolderBadge}>
              <FolderOpen aria-hidden="true" size={18} strokeWidth={1.9} />
            </span>
          ) : (
            <span className={styles.chatSidebarFolderGlyph}>
              <Folder aria-hidden="true" size={18} strokeWidth={1.9} />
            </span>
          ),
          onDelete: () => requestProjectDelete(project.id),
          onSelect: () => handleProjectSelect(project.id),
          trailingVisual: isActiveProject ? (
            <ChevronDown aria-hidden="true" size={15} strokeWidth={2} />
          ) : null,
          type: "project",
        })}

        {isActiveProject ? (
          <div className={styles.chatSidebarProjectCollection}>
            <span className={styles.chatSidebarProjectCollectionLabel}>Recent</span>
            {projectChats.length > 0 ? (
              projectChats.map((chat) => (
                <div className={styles.chatSidebarListRow} key={chat.id}>
                  {renderSidebarItemRow({
                    id: chat.id,
                    isActive: chat.id === currentThreadId,
                    itemClassName: styles.chatSidebarProjectChatItem,
                    label: chat.label,
                    labelClassName: styles.chatSidebarProjectChatLabel,
                    onDelete: () => requestChatDelete(chat.id),
                    onSelect: () => openThread(chat),
                    shellClassName: styles.chatSidebarProjectChatShell,
                    type: "chat",
                  })}
                </div>
              ))
            ) : (
              <p className={styles.chatSidebarProjectEmpty}>Start a new chat in this project.</p>
            )}
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <>
      <section
        className={[
          styles.chatStage,
          workspaceVisible ? styles.chatStageActive : "",
          isLandingState ? styles.chatStageLanding : "",
          hasActiveConversation ? styles.chatStageConversation : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {workspaceVisible && !sidebarOpen ? (
          <button
            aria-expanded={sidebarOpen}
            aria-label="Expand conversation sidebar"
            className={styles.chatSidebarReveal}
            onClick={() => {
              setSidebarActionMenu(null);
              setSidebarRenameDraft(null);
              setSidebarOpen(true);
            }}
            type="button"
          >
            <PanelLeftOpen aria-hidden="true" size={16} strokeWidth={1.9} />
          </button>
        ) : null}

        {workspaceVisible && sidebarOpen ? (
          <aside aria-label="Conversation navigation" className={styles.chatSidebar}>
            <div className={styles.chatSidebarHeader}>
              <button
                aria-expanded={sidebarOpen}
                aria-label="Collapse conversation sidebar"
                className={styles.chatSidebarCollapse}
                onClick={() => {
                  setSidebarActionMenu(null);
                  setSidebarRenameDraft(null);
                  setSidebarOpen(false);
                }}
                type="button"
              >
                <PanelLeftClose aria-hidden="true" size={16} strokeWidth={1.9} />
              </button>
            </div>

            <div className={styles.chatSidebarSection}>
              <button className={styles.chatSidebarAction} onClick={handleNewProject} type="button">
                <span className={styles.chatSidebarActionLabel}>
                  <FolderPlus aria-hidden="true" size={16} strokeWidth={1.9} />
                  <span>New project</span>
                </span>
              </button>

              <ul className={styles.chatSidebarList} id="chat-project-collection">
                {projects.map((project) => renderProjectRow(project))}
              </ul>
            </div>

            <div className={styles.chatSidebarSection}>
              <button className={styles.chatSidebarAction} onClick={handleNewChat} type="button">
                <span className={styles.chatSidebarActionLabel}>
                  <MessageSquareText aria-hidden="true" size={16} strokeWidth={1.9} />
                  <span>New chat</span>
                </span>
              </button>
            </div>

            {sidebarNotice ? (
              <p
                aria-live="polite"
                className={[
                  styles.chatSidebarNotice,
                  sidebarNotice.tone === "error" ? styles.chatSidebarNoticeError : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {sidebarNotice.message}
              </p>
            ) : null}
          </aside>
        ) : null}

        <div
          className={[
            styles.chatStageMain,
            isAssistRailVisible ? styles.chatStageMainWithJobs : "",
            workspaceVisible && sidebarOpen ? styles.chatStageMainShifted : "",
            workspaceVisible && !sidebarOpen ? styles.chatStageMainExpanded : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={conversationComposerStyle ?? undefined}
        >
          <div
            className={[
              styles.chatStagePrimary,
              isAssistRailVisible ? styles.chatStagePrimaryWithJobs : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div
              aria-live="polite"
              className={[
                styles.chatTranscript,
                hasActiveConversation ? styles.chatTranscriptConversation : "",
              ]
                .filter(Boolean)
                .join(" ")}
              ref={transcriptRef}
            >
              {isProjectHomeVisible && activeProject ? (
                <section className={styles.projectHome}>
                  <header className={styles.projectHomeHeader}>
                    <div className={styles.projectHomeTitle}>
                      <FolderOpen aria-hidden="true" size={22} strokeWidth={1.9} />
                      <h2>{activeProject.label}</h2>
                    </div>
                  </header>

                  {renderComposer(`New chat in ${activeProject.label}`, styles.projectHomeComposer)}

                  <div className={styles.projectHomeTabs}>
                    <button
                      className={[styles.projectHomeTab, styles.projectHomeTabActive]
                        .filter(Boolean)
                        .join(" ")}
                      type="button"
                    >
                      Chats
                    </button>
                    <button className={styles.projectHomeTab} type="button">
                      Sources
                    </button>
                  </div>

                  <div className={styles.projectHomeList}>
                    {activeProjectThreads.length > 0 ? (
                      activeProjectThreads.map((thread) => (
                        <button
                          className={styles.projectHomeThreadRow}
                          key={thread.id}
                          onClick={() => openThread(thread)}
                          type="button"
                        >
                          <div className={styles.projectHomeThreadHeader}>
                            <span className={styles.projectHomeThreadTitle}>{thread.label}</span>
                            <span className={styles.projectHomeThreadDate}>
                              {formatThreadUpdatedAt(thread.updatedAt)}
                            </span>
                          </div>
                          <p className={styles.projectHomeThreadPreview}>
                            {buildThreadPreview(thread)}
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className={styles.projectHomeEmpty}>
                        Start a new chat in this project and it will appear here.
                      </p>
                    )}
                  </div>
                </section>
              ) : transcript.length === 0 ? (
                <div
                  className={[styles.chatEmptyState, styles.chatEmptyStateLanding]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.chatStarterGroup}>
                    <div className={styles.starterQuestionStack}>
                      {starterActions.map((action) =>
                        action.kind !== "link" ? (
                          <button
                            className={[
                              styles.starterQuestionPill,
                              action.accent === "jobs" ? styles.starterQuestionPillJobs : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={action.label}
                            onClick={() => handleStarterAction(action)}
                            type="button"
                          >
                            {action.label}
                          </button>
                        ) : (
                          <Link
                            className={[
                              styles.starterQuestionPill,
                              action.accent === "primary" ? styles.starterQuestionPillPrimary : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            href={action.href}
                            key={action.label}
                          >
                            {action.label}
                          </Link>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                transcript.map((entry, index) => (
                  <div
                    className={[
                      styles.transcriptRow,
                      hasActiveConversation && index === 0 ? styles.transcriptRowConversationStart : "",
                      entry.role === "user"
                        ? styles.transcriptRowUser
                        : styles.transcriptRowAssistant,
                    ].join(" ")}
                    data-transcript-entry-id={entry.id}
                    key={entry.id}
                  >
                    <article
                      className={[
                        styles.transcriptBubble,
                        entry.role === "user"
                          ? styles.transcriptBubbleUser
                          : styles.transcriptBubbleAssistant,
                        entry.error ? styles.transcriptBubbleError : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {entry.attachments?.length ? (
                        <ChatMessageAttachments attachments={entry.attachments} />
                      ) : null}
                      {entry.content.trim() ? <p>{entry.content}</p> : null}
                    </article>
                  </div>
                ))
              )}

              {isSubmitting ? (
                <div className={[styles.transcriptRow, styles.transcriptRowAssistant].join(" ")}>
                  <article
                    className={[styles.transcriptBubble, styles.transcriptBubbleAssistant].join(" ")}
                  >
                    <div className={styles.transcriptTyping}>
                      <LoaderCircle
                        aria-hidden="true"
                        className={styles.spinner}
                        size={18}
                        strokeWidth={2}
                      />
                      <span>{composerContent.typingLabel}</span>
                    </div>
                  </article>
                </div>
              ) : null}
            </div>

            {!isProjectHomeVisible
              ? renderComposer(
                  activeComposerPlaceholder,
                  styles.composerDockLanding,
                )
              : null}
          </div>

          {isEmployerMode && isCandidateAssistVisible ? (
            <div className={styles.chatStageJobsRail}>
              <EmployerCandidateResultsRail
                candidates={candidateAssistListings}
                errorMessage={candidateAssistError}
                isLoading={isCandidateAssistLoading}
                onOpenDetail={handleOpenCandidateDetail}
                onRefresh={() => {
                  setCandidateAssistRefreshKey((currentKey) => currentKey + 1);
                }}
                onShortlist={handleShortlistCandidate}
                query={candidateAssistResponse?.query}
                shortlistedCandidateIds={shortlistedCandidateIds}
              />
            </div>
          ) : null}

          {!isEmployerMode && isJobsAssistVisible ? (
            <div className={styles.chatStageJobsRail}>
              <JobsSidePanel
                emptyStateMessage={jobsAssistEmptyState}
                errorMessage={jobsAssistError}
                isLoading={isJobsAssistLoading}
                jobs={jobsAssistListings}
                onApply={handleApplyJob}
                onRefresh={() => {
                  setJobsAssistRefreshKey((currentKey) => currentKey + 1);
                }}
              />
            </div>
          ) : null}
        </div>
      </section>

      {isMounted && projectActivityState.projectId
        ? createPortal(
            <div
              className={styles.sidebarDeleteOverlay}
              onClick={closeProjectActivityHistory}
              role="presentation"
            >
              <div
                aria-modal="true"
                className={styles.activityHistoryDialog}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                role="dialog"
              >
                <div className={styles.activityHistoryHeader}>
                  <div>
                    <h2 className={styles.activityHistoryTitle}>Project activity history</h2>
                    <p className={styles.activityHistoryMeta}>
                      Review checkpoints, extracted memory, and recent saved events.
                    </p>
                  </div>
                  <button
                    className={styles.activityHistoryClose}
                    onClick={closeProjectActivityHistory}
                    type="button"
                  >
                    Close
                  </button>
                </div>

                {projectActivityState.isLoading ? (
                  <p className={styles.activityHistoryState}>Loading activity...</p>
                ) : projectActivityState.error ? (
                  <p className={styles.activityHistoryState}>{projectActivityState.error}</p>
                ) : projectActivityState.payload ? (
                  <div className={styles.activityHistoryBody}>
                    <section className={styles.activityHistorySection}>
                      <h3>Checkpoints</h3>
                      {projectActivityState.payload.checkpoints.length > 0 ? (
                        projectActivityState.payload.checkpoints.map((checkpoint) => (
                          <div className={styles.activityHistoryRow} key={checkpoint.id}>
                            <div className={styles.activityHistoryRowCopy}>
                              <strong>{checkpoint.title}</strong>
                              <span>{checkpoint.summary}</span>
                              <small>
                                {checkpoint.checkpointType} checkpoint •{" "}
                                {formatRelativeTimestamp(checkpoint.createdAt)}
                              </small>
                            </div>
                            <button
                              className={styles.persistenceAction}
                              disabled={
                                projectActivityState.restoringCheckpointId === checkpoint.id
                              }
                              onClick={() => {
                                void restoreCheckpointFromActivity(checkpoint.id);
                              }}
                              type="button"
                            >
                              {projectActivityState.restoringCheckpointId === checkpoint.id
                                ? "Restoring..."
                                : "Restore"}
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className={styles.activityHistoryEmpty}>No checkpoints yet.</p>
                      )}
                    </section>

                    <section className={styles.activityHistorySection}>
                      <h3>Recent activity</h3>
                      {projectActivityState.payload.events.length > 0 ? (
                        projectActivityState.payload.events.map((event) => (
                          <div className={styles.activityHistoryRow} key={event.id}>
                            <div className={styles.activityHistoryRowCopy}>
                              <strong>{event.summary}</strong>
                              <small>
                                {event.eventType} • {formatRelativeTimestamp(event.createdAt)}
                              </small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className={styles.activityHistoryEmpty}>No project activity recorded yet.</p>
                      )}
                    </section>

                    <section className={styles.activityHistorySection}>
                      <h3>Durable memory</h3>
                      {projectActivityState.payload.memoryRecords.length > 0 ? (
                        projectActivityState.payload.memoryRecords.map((memory) => (
                          <div className={styles.activityHistoryRow} key={memory.id}>
                            <div className={styles.activityHistoryRowCopy}>
                              <strong>{memory.title}</strong>
                              <span>{memory.content}</span>
                              <small>
                                {memory.memoryType} • {formatRelativeTimestamp(memory.updatedAt)}
                              </small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className={styles.activityHistoryEmpty}>
                          No durable memory has been extracted yet.
                        </p>
                      )}
                    </section>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      {isMounted && selectedCandidateDetail ? (
        <EmployerCandidateDetailModal
          candidate={selectedCandidateDetail}
          isShortlisted={shortlistedCandidateIds.includes(selectedCandidateDetail.candidateId)}
          onClose={closeCandidateDetail}
          onShortlist={handleShortlistCandidate}
        />
      ) : null}

      {isMounted && sidebarDeleteDraft
        ? createPortal(
            <div
              className={styles.sidebarDeleteOverlay}
              onClick={closeSidebarDeleteDialog}
              role="presentation"
            >
              <div
                aria-describedby={deleteDialogDescriptionId}
                aria-labelledby={deleteDialogTitleId}
                aria-modal="true"
                className={styles.sidebarDeleteDialog}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                role="dialog"
              >
                <div className={styles.sidebarDeleteDialogBody}>
                  <h2 className={styles.sidebarDeleteDialogTitle} id={deleteDialogTitleId}>
                    {sidebarDeleteDraft.type === "project" ? "Delete project?" : "Delete chat?"}
                  </h2>
                  <p
                    className={styles.sidebarDeleteDialogCopy}
                    id={deleteDialogDescriptionId}
                  >
                    {sidebarDeleteDraft.type === "project" ? (
                      <>
                        This will delete{" "}
                        <strong>{sidebarDeleteDraft.label}</strong>
                        {sidebarDeleteDraft.chatCount > 0
                          ? ` and ${sidebarDeleteDraft.chatCount} ${
                              sidebarDeleteDraft.chatCount === 1 ? "chat" : "chats"
                            } inside it.`
                          : "."}
                      </>
                    ) : (
                      <>
                        This will delete <strong>{sidebarDeleteDraft.label}</strong>.
                      </>
                    )}
                  </p>
                  <p className={styles.sidebarDeleteDialogMeta}>
                    {sidebarDeleteDraft.type === "project"
                      ? "Every chat inside this project will be removed from your workspace."
                      : "Messages inside this chat will be removed from your workspace."}
                  </p>
                </div>

                <div className={styles.sidebarDeleteDialogActions}>
                  <button
                    className={styles.sidebarDeleteDialogCancel}
                    onClick={closeSidebarDeleteDialog}
                    ref={sidebarDeleteCancelButtonRef}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.sidebarDeleteDialogConfirm}
                    onClick={confirmSidebarDelete}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
