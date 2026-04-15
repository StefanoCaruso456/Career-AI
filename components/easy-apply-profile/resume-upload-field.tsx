"use client";

import { FileUp, LoaderCircle, Paperclip } from "lucide-react";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { FileUploadDropzone } from "@/components/file-upload-dropzone";
import type { ResumeAssetReference } from "@/lib/application-profiles/types";
import styles from "./easy-apply-profile.module.css";

type ResumeUploadFieldProps = {
  disabled?: boolean;
  helperText?: string;
  isUploading: boolean;
  label: string;
  onUploaded: (value: ResumeAssetReference) => void;
  onUploadResume: (file: File) => Promise<ResumeAssetReference>;
  value: ResumeAssetReference | null;
};

export function ResumeUploadField({
  disabled = false,
  helperText,
  isUploading,
  label,
  onUploaded,
  onUploadResume,
  value,
}: ResumeUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileSelection(file: File | null) {
    if (!file || disabled || isUploading) {
      return;
    }

    setUploadError(null);

    try {
      const uploadedReference = await onUploadResume(file);
      onUploaded(uploadedReference);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Resume upload failed.");
    }
  }

  return (
    <FileUploadDropzone
      error={uploadError}
      hint={helperText}
      onFilesDropped={(files) => {
        void handleFileSelection(files[0] ?? null);
      }}
    >
      <div className={styles.fileCard}>
        <div className={styles.fileRow}>
          <div className={styles.fileCopy}>
            <span className={styles.fieldLabel}>{label}</span>
            {value ? (
              <div className={styles.fileMeta}>
                <Paperclip aria-hidden="true" size={16} strokeWidth={2} />
                <span>{value.fileName}</span>
              </div>
            ) : (
              <span className={styles.fileHint}>Drop a file here or choose one manually.</span>
            )}
          </div>

          <button
            className={styles.fileAction}
            disabled={disabled || isUploading}
            onClick={() => {
              inputRef.current?.click();
            }}
            type="button"
          >
            {isUploading ? (
              <LoaderCircle className={styles.inlineSpinner} aria-hidden="true" size={16} strokeWidth={2} />
            ) : (
              <FileUp aria-hidden="true" size={16} strokeWidth={2} />
            )}
            <span>{value ? "Replace file" : "Choose file"}</span>
          </button>
        </div>

        <input
          accept=".pdf,.doc,.docx"
          className={styles.hiddenInput}
          id={inputId}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            void handleFileSelection(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />
      </div>
    </FileUploadDropzone>
  );
}
