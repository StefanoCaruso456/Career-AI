"use client";

import type {
  AnyApplicationProfile,
  ResumeAssetReference,
  SchemaFamily,
} from "@/lib/application-profiles/types";
import { EasyApplyProfileModal } from "./easy-apply-profile-modal";

type MissingFieldsModalProps = {
  companyName: string;
  initialProfile: AnyApplicationProfile;
  isOpen: boolean;
  isSaving: boolean;
  jobTitle: string;
  missingFieldKeys: string[];
  onClose: () => void;
  onSaveProfile: (profile: AnyApplicationProfile) => Promise<void>;
  onUploadResume: (file: File) => Promise<ResumeAssetReference>;
  persisted: boolean;
  schemaFamily: SchemaFamily;
  userKey: string;
};

export function MissingFieldsModal(props: MissingFieldsModalProps) {
  return (
    <EasyApplyProfileModal
      companyName={props.companyName}
      initialProfile={props.initialProfile}
      isOpen={props.isOpen}
      isSaving={props.isSaving}
      jobTitle={props.jobTitle}
      missingFieldKeys={props.missingFieldKeys}
      mode="missing-fields"
      onClose={props.onClose}
      onSaveProfile={props.onSaveProfile}
      onUploadResume={props.onUploadResume}
      persisted={props.persisted}
      schemaFamily={props.schemaFamily}
      userKey={props.userKey}
    />
  );
}
