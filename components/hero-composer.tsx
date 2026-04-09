"use client";

import {
  ArrowUp,
  ChevronDown,
  Clock3,
  LoaderCircle,
  Mic,
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

export function HeroComposer() {
  const [message, setMessage] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const canSubmit = message.trim().length > 0 && !isSubmitting;

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

  async function submitMessage() {
    if (!canSubmit) {
      return;
    }

    const prompt = message.trim();
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

  return (
    <section className={styles.chatStage}>
      <div aria-live="polite" className={styles.chatTranscript} ref={transcriptRef}>
        {transcript.length === 0 ? (
          <div className={styles.chatEmptyState}>
            <span className={styles.chatEmptyEyebrow}>Preview the workflow</span>
            <p className={styles.chatEmptyBody}>
              Ask about candidate verification, recruiter sharing, or review operations.
            </p>
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
                <LoaderCircle aria-hidden="true" className={styles.spinner} size={18} strokeWidth={2} />
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
    </section>
  );
}
