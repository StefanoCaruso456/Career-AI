"use client";

import Link from "next/link";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Clock3,
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
  Plus,
  Share2,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
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

type TranscriptEntry = {
  content: string;
  error?: boolean;
  id: string;
  role: "assistant" | "user";
};

type ProjectEntry = {
  id: string;
  label: string;
};

type ChatThread = {
  id: string;
  label: string;
  projectId: string;
  transcript: TranscriptEntry[];
  updatedAt: number;
};

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

type VoiceEnabledWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

const starterActions = [
  { kind: "prompt", label: "What does the agent actually do?" },
  { kind: "prompt", label: "How is this different from a resume builder?" },
  { kind: "prompt", label: "How does the agent help me get hired faster?" },
  { kind: "link", href: "/agent-build", label: "Start Building My Career ID" },
] as const;

const initialProjectCollections: ProjectEntry[] = [
  { id: "project-verified-profile", label: "Verified profile" },
  { id: "project-career-story", label: "Career story" },
  { id: "project-hiring-signals", label: "Hiring signals" },
];

const preferredRecorderMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

const cancelledVoiceCaptureError = "__voice-capture-cancelled__";

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

function formatThreadLabel(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length <= 38) {
    return normalized;
  }

  return `${normalized.slice(0, 35)}...`;
}

function createEntityId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSidebarEntityLabel(type: SidebarEntityType) {
  return type === "project" ? "project" : "chat";
}

function capitalizeLabel(label: string) {
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function buildThreadLabel(transcript: TranscriptEntry[]) {
  const firstUserEntry = transcript.find((entry) => entry.role === "user");

  if (!firstUserEntry) {
    return "New chat";
  }

  return formatThreadLabel(firstUserEntry.content);
}

function buildProjectLabel(projects: ProjectEntry[]) {
  let projectIndex = 1;

  while (true) {
    const candidateLabel = projectIndex === 1 ? "New project" : `New project ${projectIndex}`;

    if (!projects.some((project) => project.label === candidateLabel)) {
      return candidateLabel;
    }

    projectIndex += 1;
  }
}

function buildThreadPreview(thread: ChatThread) {
  const firstNarrativeEntry = thread.transcript.find((entry) => entry.role === "user");
  const fallbackEntry = thread.transcript[thread.transcript.length - 1];
  const previewSource = firstNarrativeEntry?.content ?? fallbackEntry?.content ?? "Start a new chat in this project.";
  const normalizedPreview = previewSource.replace(/\s+/g, " ").trim();

  if (normalizedPreview.length <= 96) {
    return normalizedPreview;
  }

  return `${normalizedPreview.slice(0, 93)}...`;
}

function formatThreadUpdatedAt(updatedAt: number) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(updatedAt));
}

export function HeroComposer() {
  const sidebarId = useId();
  const deleteDialogTitleId = `${sidebarId}-delete-dialog-title`;
  const deleteDialogDescriptionId = `${sidebarId}-delete-dialog-description`;
  const [message, setMessage] = useState("");
  const [projects, setProjects] = useState(initialProjectCollections);
  const [activeProjectId, setActiveProjectId] = useState(initialProjectCollections[0].id);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [projectHomeProjectId, setProjectHomeProjectId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [voiceInputState, setVoiceInputState] = useState<VoiceInputState>("idle");
  const [voiceNotice, setVoiceNotice] = useState<ComposerNotice | null>(null);
  const [sidebarActionMenu, setSidebarActionMenu] = useState<SidebarActionMenu | null>(null);
  const [sidebarRenameDraft, setSidebarRenameDraft] = useState<SidebarRenameDraft | null>(null);
  const [sidebarDeleteDraft, setSidebarDeleteDraft] = useState<SidebarDeleteDraft | null>(null);
  const [sidebarNotice, setSidebarNotice] = useState<SidebarNotice | null>(null);
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
  const canSubmit = message.trim().length > 0 && !isSubmitting && !isRecording && !isTranscribing;
  const workspaceVisible = true;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeProjectThreads = activeProject ? getProjectThreads(activeProject.id) : [];
  const isProjectHomeVisible =
    activeProject !== null &&
    currentThreadId === null &&
    projectHomeProjectId === activeProject.id;

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
      top: Math.max(anchoredEntry.offsetTop - 4, 0),
    });
    transcriptScrollIntentRef.current = null;
  }, [transcript]);

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

  function upsertThread(threadId: string, projectId: string, nextTranscript: TranscriptEntry[]) {
    if (nextTranscript.length === 0) {
      return;
    }

    const nextThread: ChatThread = {
      id: threadId,
      label: buildThreadLabel(nextTranscript),
      projectId,
      transcript: nextTranscript,
      updatedAt: Date.now(),
    };

    setThreads((currentThreads) => [
      nextThread,
      ...currentThreads.filter((thread) => thread.id !== threadId),
    ]);
  }

  function openThread(thread: ChatThread) {
    cancelVoiceCapture();
    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setProjectHomeProjectId(null);
    setActiveProjectId(thread.projectId);
    setCurrentThreadId(thread.id);
    transcriptScrollIntentRef.current = { mode: "top" };
    setTranscript(thread.transcript);
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
    setMessage("");
    focusComposer();
  }

  function handleNewProject() {
    const nextProject: ProjectEntry = {
      id: createEntityId("project"),
      label: buildProjectLabel(projects),
    };

    cancelVoiceCapture();
    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setProjects((currentProjects) => [nextProject, ...currentProjects]);
    setActiveProjectId(nextProject.id);
    setProjectHomeProjectId(nextProject.id);
    setSidebarOpen(true);
    setCurrentThreadId(null);
    transcriptScrollIntentRef.current = { mode: "top" };
    setTranscript([]);
    setMessage("");
    focusComposer();
  }

  async function submitMessage(nextMessage?: string) {
    const prompt = (nextMessage ?? message).trim();

    if (!prompt || isSubmitting) {
      return;
    }

    const requestId = `msg-${Date.now()}`;
    const threadId = currentThreadId ?? createEntityId("thread");
    const projectId = activeProjectId;
    const nextUserTranscript = [
      ...transcript,
      { content: prompt, id: `${requestId}-user`, role: "user" as const },
    ];

    setIsSubmitting(true);
    setMessage("");
    setProjectHomeProjectId(null);
    setCurrentThreadId(threadId);
    transcriptScrollIntentRef.current = { mode: "bottom" };
    setTranscript(nextUserTranscript);
    upsertThread(threadId, projectId, nextUserTranscript);

    try {
      const reply = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: prompt }),
      });

      const payload = (await reply.json()) as { error?: string; output?: string };

      if (!reply.ok || !payload.output) {
        throw new Error(payload.error || "The assistant could not respond.");
      }

      startTransition(() => {
        const nextAssistantTranscript = [
          ...nextUserTranscript,
          {
            content: payload.output || "",
            id: `${requestId}-assistant`,
            role: "assistant" as const,
          },
        ];

        transcriptScrollIntentRef.current = {
          entryId: `${requestId}-assistant`,
          mode: "anchor-entry",
        };
        setTranscript(nextAssistantTranscript);
        upsertThread(threadId, projectId, nextAssistantTranscript);
      });
    } catch (requestError) {
      startTransition(() => {
        const nextAssistantTranscript = [
          ...nextUserTranscript,
          {
            content:
              requestError instanceof Error
                ? requestError.message
                : "The assistant could not respond.",
            error: true,
            id: `${requestId}-assistant-error`,
            role: "assistant" as const,
          },
        ];

        transcriptScrollIntentRef.current = {
          entryId: `${requestId}-assistant-error`,
          mode: "anchor-entry",
        };
        setTranscript(nextAssistantTranscript);
        upsertThread(threadId, projectId, nextAssistantTranscript);
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage();
  }

  async function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await submitMessage();
    }
  }

  function handleMessageChange(nextMessage: string) {
    setMessage(nextMessage);

    if (voiceNotice?.tone === "error") {
      setVoiceNotice(null);
    }
  }

  function handleStarterQuestion(question: string) {
    void submitMessage(question);
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

  function submitSidebarRename() {
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

    if (sidebarRenameDraft.type === "project") {
      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === sidebarRenameDraft.id
            ? {
                ...project,
                label: normalizedLabel,
              }
            : project,
        ),
      );
    } else {
      setThreads((currentThreads) =>
        currentThreads.map((thread) =>
          thread.id === sidebarRenameDraft.id
            ? {
                ...thread,
                label: normalizedLabel,
              }
            : thread,
        ),
      );
    }

    setSidebarRenameDraft(null);
    setSidebarNotice({
      message: `${capitalizeLabel(entityLabel)} renamed.`,
      tone: "default",
    });
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

  function handleProjectDelete(projectId: string) {
    const project = projects.find((currentProject) => currentProject.id === projectId);

    if (!project) {
      return;
    }

    cancelVoiceCapture();
    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setSidebarDeleteDraft(null);

    const remainingProjects = projects.filter((currentProject) => currentProject.id !== projectId);
    const remainingThreads = threads.filter((thread) => thread.projectId !== projectId);

    let nextProjects = remainingProjects;
    let nextActiveProjectId = activeProjectId;
    const isDeletedProjectActive =
      activeProjectId === projectId || projectHomeProjectId === projectId;

    if (remainingProjects.length === 0) {
      const replacementProject: ProjectEntry = {
        id: createEntityId("project"),
        label: "New project",
      };

      nextProjects = [replacementProject];
      nextActiveProjectId = replacementProject.id;
    } else if (activeProjectId === projectId) {
      nextActiveProjectId = remainingProjects[0].id;
    }

    setProjects(nextProjects);
    setThreads(remainingThreads);

    if (isDeletedProjectActive) {
      setActiveProjectId(nextActiveProjectId);
      setProjectHomeProjectId(nextActiveProjectId);
      setCurrentThreadId(null);
      transcriptScrollIntentRef.current = { mode: "top" };
      setTranscript([]);
      setMessage("");
    }

    setSidebarNotice({
      message: "Project deleted.",
      tone: "default",
    });
  }

  function handleChatDelete(chatId: string) {
    const chat = threads.find((currentChat) => currentChat.id === chatId);

    if (!chat) {
      return;
    }

    cancelVoiceCapture();
    setSidebarActionMenu(null);
    setSidebarRenameDraft(null);
    setSidebarDeleteDraft(null);

    const remainingThreads = threads.filter((thread) => thread.id !== chatId);

    setThreads(remainingThreads);

    if (currentThreadId === chatId) {
      setProjectHomeProjectId(activeProjectId);
      setCurrentThreadId(null);
      transcriptScrollIntentRef.current = { mode: "top" };
      setTranscript([]);
      setMessage("");
    }

    setSidebarNotice({
      message: "Chat deleted.",
      tone: "default",
    });
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
      handleProjectDelete(sidebarDeleteDraft.id);
      return;
    }

    handleChatDelete(sidebarDeleteDraft.id);
  }

  function getProjectThreads(projectId: string) {
    return threads.filter((thread) => thread.projectId === projectId);
  }

  function renderComposer(placeholder: string, className?: string) {
    return (
      <form
        className={[styles.composerDock, className ?? ""].filter(Boolean).join(" ")}
        onSubmit={handleSubmit}
      >
        <div className={styles.composerTop}>
          <textarea
            aria-label="Message composer"
            aria-describedby={voiceNotice ? "hero-composer-voice-status" : undefined}
            className={styles.composerInput}
            disabled={isSubmitting || isRecording || isTranscribing}
            onChange={(event) => handleMessageChange(event.target.value)}
            onKeyDown={(event) => {
              void handleKeyDown(event);
            }}
            placeholder={
              isRecording
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

        {voiceNotice ? (
          <div aria-live="polite" className={styles.composerMeta} id="hero-composer-voice-status">
            <p
              className={[
                styles.composerStatus,
                voiceNotice.tone === "active"
                  ? styles.composerStatusActive
                  : voiceNotice.tone === "error"
                    ? styles.composerStatusError
                    : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {voiceNotice.message}
            </p>
          </div>
        ) : null}

        <div className={styles.composerFooter}>
          <div className={styles.composerStart}>
            <button aria-label="Add attachment" className={styles.iconCircle} type="button">
              <Plus size={18} strokeWidth={2.1} />
            </button>

            <button className={styles.modePill} type="button">
              <Clock3 aria-hidden="true" size={16} strokeWidth={1.9} />
              <span>Thinking</span>
              <ChevronDown aria-hidden="true" size={14} strokeWidth={2} />
            </button>
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
              disabled={isSubmitting || isTranscribing}
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
              submitSidebarRename();
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
        className={[styles.chatStage, workspaceVisible ? styles.chatStageActive : ""]
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
            workspaceVisible && sidebarOpen ? styles.chatStageMainShifted : "",
            workspaceVisible && !sidebarOpen ? styles.chatStageMainExpanded : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div aria-live="polite" className={styles.chatTranscript} ref={transcriptRef}>
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
              <div className={styles.chatEmptyState}>
                <div className={styles.chatStarterGroup}>
                  <div className={styles.starterQuestionStack}>
                    {starterActions.map((action) =>
                      action.kind === "prompt" ? (
                        <button
                          className={styles.starterQuestionPill}
                          key={action.label}
                          onClick={() => handleStarterQuestion(action.label)}
                          type="button"
                        >
                          {action.label}
                        </button>
                      ) : (
                        <Link
                          className={[styles.starterQuestionPill, styles.starterQuestionPillPrimary]
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
              transcript.map((entry) => (
                <div
                  className={[
                    styles.transcriptRow,
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
                    <p>{entry.content}</p>
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
                    <span>Thinking through your verification workflow...</span>
                  </div>
                </article>
              </div>
            ) : null}
          </div>

          {!isProjectHomeVisible
            ? renderComposer(
                "Ask about verification workflows, recruiter trust views, or candidate proof.",
              )
            : null}
        </div>
      </section>

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
