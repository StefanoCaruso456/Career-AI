"use client";

import Link from "next/link";
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderOpen,
  LoaderCircle,
  MessageSquareText,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";
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

const starterActions = [
  { kind: "prompt", label: "What does the agent actually do?" },
  { kind: "prompt", label: "How is this different from a resume builder?" },
  { kind: "prompt", label: "How does the agent help me get hired faster?" },
  { kind: "link", href: "/agent-build", label: "Start Building My Agent ID" },
] as const;

const initialProjectCollections: ProjectEntry[] = [
  { id: "project-verified-profile", label: "Verified profile" },
  { id: "project-career-story", label: "Career story" },
  { id: "project-hiring-signals", label: "Hiring signals" },
];

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

export function HeroComposer() {
  const [message, setMessage] = useState("");
  const [projects, setProjects] = useState(initialProjectCollections);
  const [activeProjectId, setActiveProjectId] = useState(initialProjectCollections[0].id);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(true);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const canSubmit = message.trim().length > 0 && !isSubmitting;
  const workspaceVisible =
    transcript.length > 0 ||
    isSubmitting ||
    threads.length > 0 ||
    projects.length > initialProjectCollections.length;
  const recentChats = threads
    .filter((thread) => thread.projectId === activeProjectId)
    .slice(0, 4);

  useEffect(() => {
    const transcriptNode = transcriptRef.current;

    if (!transcriptNode) {
      return;
    }

    transcriptNode.scrollTo({
      behavior: "smooth",
      top: transcriptNode.scrollHeight,
    });
  }, [transcript]);

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
    setActiveProjectId(thread.projectId);
    setCurrentThreadId(thread.id);
    setTranscript(thread.transcript);
    setMessage("");
    setChatsOpen(true);
    setSidebarOpen(true);
  }

  function handleNewChat() {
    setCurrentThreadId(null);
    setTranscript([]);
    setMessage("");
    setChatsOpen(true);
    setSidebarOpen(true);
  }

  function handleProjectSelect(projectId: string) {
    const nextThread = threads.find((thread) => thread.projectId === projectId);

    setActiveProjectId(projectId);
    setProjectsOpen(true);
    setChatsOpen(true);
    setSidebarOpen(true);
    setMessage("");

    if (nextThread) {
      setCurrentThreadId(nextThread.id);
      setTranscript(nextThread.transcript);
      return;
    }

    setCurrentThreadId(null);
    setTranscript([]);
  }

  function handleNewProject() {
    const nextProject: ProjectEntry = {
      id: createEntityId("project"),
      label: buildProjectLabel(projects),
    };

    setProjects((currentProjects) => [nextProject, ...currentProjects]);
    setActiveProjectId(nextProject.id);
    setProjectsOpen(true);
    setChatsOpen(true);
    setSidebarOpen(true);
    setCurrentThreadId(null);
    setTranscript([]);
    setMessage("");
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
    setCurrentThreadId(threadId);
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

  async function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await submitMessage();
    }
  }

  function handleStarterQuestion(question: string) {
    void submitMessage(question);
  }

  return (
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
          onClick={() => setSidebarOpen(true)}
          type="button"
        >
          <PanelLeftOpen aria-hidden="true" size={16} strokeWidth={1.9} />
          <span>Workspace</span>
        </button>
      ) : null}

      {workspaceVisible && sidebarOpen ? (
        <aside aria-label="Conversation navigation" className={styles.chatSidebar}>
          <div className={styles.chatSidebarHeader}>
            <span className={styles.chatSidebarCaption}>Workspace</span>
            <button
              aria-expanded={sidebarOpen}
              aria-label="Collapse conversation sidebar"
              className={styles.chatSidebarCollapse}
              onClick={() => setSidebarOpen(false)}
              type="button"
            >
              <PanelLeftClose aria-hidden="true" size={16} strokeWidth={1.9} />
            </button>
          </div>

          <div className={styles.chatSidebarSection}>
            <button className={styles.chatSidebarAction} onClick={handleNewProject} type="button">
              <span className={styles.chatSidebarActionLabel}>
                <FolderOpen aria-hidden="true" size={16} strokeWidth={1.9} />
                <span>Project +</span>
              </span>
            </button>

            <button
              aria-controls="chat-project-collection"
              aria-expanded={projectsOpen}
              className={styles.chatSidebarToggle}
              onClick={() => setProjectsOpen((currentState) => !currentState)}
              type="button"
            >
              <span className={styles.chatSidebarToggleLabel}>
                <FolderOpen aria-hidden="true" size={16} strokeWidth={1.9} />
                <span>Projects</span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className={[
                  styles.chatSidebarChevron,
                  projectsOpen ? styles.chatSidebarChevronOpen : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                size={16}
                strokeWidth={2.1}
              />
            </button>

            <ul
              className={styles.chatSidebarList}
              hidden={!projectsOpen}
              id="chat-project-collection"
            >
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    className={[
                      styles.chatSidebarItem,
                      project.id === activeProjectId ? styles.chatSidebarItemActive : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleProjectSelect(project.id)}
                    type="button"
                  >
                    {project.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.chatSidebarSection}>
            <button className={styles.chatSidebarAction} onClick={handleNewChat} type="button">
              <span className={styles.chatSidebarActionLabel}>
                <MessageSquareText aria-hidden="true" size={16} strokeWidth={1.9} />
                <span>Chat +</span>
              </span>
            </button>

            <button
              aria-controls="chat-recent-collection"
              aria-expanded={chatsOpen}
              className={styles.chatSidebarToggle}
              onClick={() => setChatsOpen((currentState) => !currentState)}
              type="button"
            >
              <span className={styles.chatSidebarToggleLabel}>
                <MessageSquareText aria-hidden="true" size={16} strokeWidth={1.9} />
                <span>Chats</span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className={[
                  styles.chatSidebarChevron,
                  chatsOpen ? styles.chatSidebarChevronOpen : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                size={16}
                strokeWidth={2.1}
              />
            </button>

            <div
              className={styles.chatSidebarList}
              hidden={!chatsOpen}
              id="chat-recent-collection"
            >
              <span className={styles.chatSidebarListLabel}>Collection</span>
              {recentChats.length > 0 ? (
                recentChats.map((chat) => (
                  <button
                    className={[
                      styles.chatSidebarItem,
                      chat.id === currentThreadId ? styles.chatSidebarItemActive : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={chat.id}
                    onClick={() => openThread(chat)}
                    type="button"
                  >
                    {chat.label}
                  </button>
                ))
              ) : (
                <p className={styles.chatSidebarEmpty}>Start a new chat to collect threads here.</p>
              )}
            </div>
          </div>
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
          {transcript.length === 0 ? (
            <div className={styles.chatEmptyState}>
              <div className={styles.chatStarterGroup}>
                <span className={styles.chatEmptyEyebrow}>Start with a question</span>
                <p className={styles.chatEmptyBody}>
                  Tap a prompt to start the conversation instantly, or type your own question below.
                </p>
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
                      <Link className={styles.starterQuestionPill} href={action.href} key={action.label}>
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
                  entry.role === "user" ? styles.transcriptRowUser : styles.transcriptRowAssistant,
                ].join(" ")}
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

        <form className={styles.composerDock} onSubmit={handleSubmit}>
          <div className={styles.composerTop}>
            <textarea
              aria-label="Message composer"
              className={styles.composerInput}
              disabled={isSubmitting}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                void handleKeyDown(event);
              }}
              placeholder="Ask about verification workflows, recruiter trust views, or candidate proof."
              rows={3}
              value={message}
            />
          </div>

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
              <button aria-label="Voice input" className={styles.iconGhost} type="button">
                <Mic size={16} strokeWidth={1.9} />
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
      </div>
    </section>
  );
}
