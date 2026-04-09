"use client";

import { Plus } from "lucide-react";
import styles from "./chat-attachments.module.css";

type AttachmentButtonProps = {
  className?: string;
  onClick: () => void;
};

export function AttachmentButton({ className, onClick }: AttachmentButtonProps) {
  return (
    <button
      aria-label="Add attachment"
      className={[styles.attachmentButton, className ?? ""].filter(Boolean).join(" ")}
      onClick={onClick}
      type="button"
    >
      <Plus size={18} strokeWidth={2.1} />
    </button>
  );
}
