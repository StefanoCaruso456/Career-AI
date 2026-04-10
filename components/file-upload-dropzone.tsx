"use client";

import {
  type DragEvent,
  type PropsWithChildren,
  useState,
} from "react";
import styles from "./chat-attachments.module.css";

type FileUploadDropzoneProps = PropsWithChildren<{
  disabled?: boolean;
  error?: string | null;
  hint?: string;
  onFilesDropped: (files: File[]) => void;
}>;

export function FileUploadDropzone({
  children,
  disabled = false,
  error,
  hint,
  onFilesDropped,
}: FileUploadDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    event.preventDefault();
    setIsDragActive(false);
    onFilesDropped(Array.from(event.dataTransfer.files ?? []));
  }

  return (
    <div
      className={[
        styles.dropzone,
        isDragActive ? styles.dropzoneActive : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {hint || error ? (
        <p
          className={[
            styles.dropzoneHint,
            error ? styles.dropzoneHintError : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {error || hint}
        </p>
      ) : null}
    </div>
  );
}
