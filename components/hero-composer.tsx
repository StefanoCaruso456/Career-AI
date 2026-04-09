"use client";

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

const starterQuestions = [
  "What does the agent actually do?",
  "How is this different from a resume builder?",
  "How does the agent help me get hired faster?",
];

const projectCollections = [
  "Verified profile",
  "Career story",
  "Hiring signals",
];

function formatThreadLabel(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length <= 38) {
    return normalized;
  }

  return `${normalized.slice(0, 35)}...`;
}

export function HeroComposer() {
  const [message, setMessage] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(true);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const canSubmit = message.trim().length > 0 && !isSubmitting;
  const conversationStarted = transcript.length > 0 || isSubmitting;
  const recentChats = transcript
    .filter((entry) => entry.role === "user")
    .slice(-4)
    .reverse()
    .map((entry) => ({
      id: entry.id,
      label: formatThreadLabel(entry.content),
    }));

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

  async function submitMessage(nextMessage?: string) {
    const prompt = (nextMessage ?? message).trim();

    if (!prompt || isSubmitting) {
      return;
    }

    const requestId = `msg-${Date.now()}`;

    setIsSubmitting(true);
    setMessage("");
    setTranscript((currentTranscript) => [
      ...currentTranscript,
      { content: prompt, id: `${requestId}-user`, role: "user" },
    ]);

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
        setTranscript((currentTranscript) => [
          ...currentTranscript,
          {
            content: payload.output || "",
            id: `${requestId}-assistant`,
            role: "assistant",
          },
        ]);
      });
    } catch (requestError) {
      startTransition(() => {
        setTranscript((currentTranscript) => [
          ...currentTranscript,
          {
            content:
              requestError instanceof Error
                ? requestError.message
                : "The assistant could not respond.",
            error: true,
            id: `${requestId}-assistant-error`,
            role: "assistant",
          },
        ]);
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
      className={[styles.chatStage, conversationStarted ? styles.chatStageActive : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {conversationStarted && !sidebarOpen ? (
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

      {conversationStarted && sidebarOpen ? (
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
              {projectCollections.map((projectLabel, index) => (
                <li key={projectLabel}>
                  <div
                    className={[
                      styles.chatSidebarItem,
                      index === 0 ? styles.chatSidebarItemActive : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {projectLabel}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.chatSidebarSection}>
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
                recentChats.map((chat, index) => (
                  <div
                    className={[
                      styles.chatSidebarItem,
                      index === 0 ? styles.chatSidebarItemActive : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={chat.id}
                  >
                    {chat.label}
                  </div>
                ))
              ) : (
                <p className={styles.chatSidebarEmpty}>Start a thread to collect chats here.</p>
              )}
            </div>
          </div>
        </aside>
      ) : null}

      <div
        className={[
          styles.chatStageMain,
          conversationStarted && sidebarOpen ? styles.chatStageMainShifted : "",
          conversationStarted && !sidebarOpen ? styles.chatStageMainExpanded : "",
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
                  {starterQuestions.map((question) => (
                    <button
                      className={styles.starterQuestionPill}
                      key={question}
                      onClick={() => handleStarterQuestion(question)}
                      type="button"
                    >
                      {question}
                    </button>
                  ))}
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
