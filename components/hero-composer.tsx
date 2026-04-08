"use client";

import {
  ArrowUp,
  ChevronDown,
  Clock3,
  LoaderCircle,
  Mic,
  Plus,
} from "lucide-react";
import { type FormEvent, type KeyboardEvent, startTransition, useState } from "react";
import styles from "./chat-home-shell.module.css";

export function HeroComposer() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = message.trim().length > 0 && !isSubmitting;

  async function submitMessage() {
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const reply = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: message.trim() }),
      });

      const payload = (await reply.json()) as { error?: string; output?: string };

      if (!reply.ok || !payload.output) {
        throw new Error(payload.error || "The assistant could not respond.");
      }

      startTransition(() => {
        setResponse(payload.output || "");
      });
    } catch (requestError) {
      startTransition(() => {
        setResponse("");
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The assistant could not respond.",
        );
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
    <>
      <form className={styles.composer} onSubmit={handleSubmit}>
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
            rows={2}
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

      {(response || error) && (
        <section
          aria-live="polite"
          className={[
            styles.heroResponse,
            error ? styles.heroResponseError : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className={styles.heroResponseHeader}>
            <span>{error ? "Connection issue" : "OpenAI preview"}</span>
            <small>{error ? "Check the server configuration and try again." : "Server-side response"}</small>
          </div>
          <p className={styles.heroResponseBody}>{error || response}</p>
        </section>
      )}
    </>
  );
}
