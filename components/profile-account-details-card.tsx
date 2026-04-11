"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { TalentIdentityDetailsDto } from "@/packages/contracts/src";
import styles from "@/app/settings/page.module.css";

export type ReadOnlyAccountRow = {
  label: string;
  value: string;
  isIdentifier?: boolean;
};

type EditableProfile = {
  displayName: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneOptional: string | null;
  countryCode: string;
};

type ProfileAccountDetailsCardProps = {
  initialCountryCode: string;
  initialDisplayName: string;
  initialEmail: string;
  initialFirstName: string;
  initialLastName: string;
  initialPhoneOptional: string | null;
  readOnlyRows: ReadOnlyAccountRow[];
};

type StatusMessage =
  | {
      tone: "error" | "success";
      value: string;
    }
  | null;

function createProfileSnapshot(args: {
  countryCode: string;
  displayName: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneOptional: string | null;
}): EditableProfile {
  return {
    displayName: args.displayName,
    email: args.email,
    firstName: args.firstName,
    lastName: args.lastName,
    phoneOptional: args.phoneOptional,
    countryCode: args.countryCode,
  };
}

function createFormState(profile: EditableProfile) {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phoneOptional: profile.phoneOptional ?? "",
    countryCode: profile.countryCode === "ZZ" ? "" : profile.countryCode,
  };
}

function formatPhoneOptional(value: string | null) {
  return value?.trim() ? value : "Not added";
}

function formatCountryCode(value: string) {
  return value === "ZZ" ? "Not set" : value;
}

function toProfileSnapshot(payload: TalentIdentityDetailsDto): EditableProfile {
  return createProfileSnapshot({
    countryCode: payload.countryCode,
    displayName: payload.displayName,
    email: payload.email,
    firstName: payload.firstName,
    lastName: payload.lastName,
    phoneOptional: payload.phoneOptional,
  });
}

export function ProfileAccountDetailsCard({
  initialCountryCode,
  initialDisplayName,
  initialEmail,
  initialFirstName,
  initialLastName,
  initialPhoneOptional,
  readOnlyRows,
}: ProfileAccountDetailsCardProps) {
  const router = useRouter();
  const { update } = useSession();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);
  const [profile, setProfile] = useState(() =>
    createProfileSnapshot({
      countryCode: initialCountryCode,
      displayName: initialDisplayName,
      email: initialEmail,
      firstName: initialFirstName,
      lastName: initialLastName,
      phoneOptional: initialPhoneOptional,
    }),
  );
  const [formState, setFormState] = useState(() =>
    createFormState(
      createProfileSnapshot({
        countryCode: initialCountryCode,
        displayName: initialDisplayName,
        email: initialEmail,
        firstName: initialFirstName,
        lastName: initialLastName,
        phoneOptional: initialPhoneOptional,
      }),
    ),
  );

  useEffect(() => {
    const nextProfile = createProfileSnapshot({
      countryCode: initialCountryCode,
      displayName: initialDisplayName,
      email: initialEmail,
      firstName: initialFirstName,
      lastName: initialLastName,
      phoneOptional: initialPhoneOptional,
    });

    setProfile(nextProfile);

    if (!isEditing) {
      setFormState(createFormState(nextProfile));
    }
  }, [
    initialCountryCode,
    initialDisplayName,
    initialEmail,
    initialFirstName,
    initialLastName,
    initialPhoneOptional,
  ]);

  const isBusy = isSaving || isRefreshing;
  const detailRows: ReadOnlyAccountRow[] = [
    { label: "Display name", value: profile.displayName },
    { label: "Email", value: profile.email },
    { label: "Phone", value: formatPhoneOptional(profile.phoneOptional) },
    { label: "Country", value: formatCountryCode(profile.countryCode) },
    ...readOnlyRows,
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextFirstName = formState.firstName.trim();
    const nextLastName = formState.lastName.trim();
    const nextPhoneOptional = formState.phoneOptional.trim();
    const nextCountryCode = formState.countryCode.trim().toUpperCase();
    const currentCountryCode = profile.countryCode === "ZZ" ? "" : profile.countryCode;
    const payload: Record<string, string | null> = {};

    if (!nextFirstName) {
      setStatusMessage({
        tone: "error",
        value: "First name is required.",
      });
      return;
    }

    if (!nextLastName) {
      setStatusMessage({
        tone: "error",
        value: "Last name is required.",
      });
      return;
    }

    if (nextCountryCode && nextCountryCode.length !== 2) {
      setStatusMessage({
        tone: "error",
        value: "Country code must use a two-letter format like US.",
      });
      return;
    }

    if (!nextCountryCode && currentCountryCode) {
      setStatusMessage({
        tone: "error",
        value: "Country code must stay as a two-letter value.",
      });
      return;
    }

    if (nextFirstName !== profile.firstName) {
      payload.firstName = nextFirstName;
    }

    if (nextLastName !== profile.lastName) {
      payload.lastName = nextLastName;
    }

    if (nextPhoneOptional !== (profile.phoneOptional ?? "")) {
      payload.phoneOptional = nextPhoneOptional || null;
    }

    if (nextCountryCode !== currentCountryCode && nextCountryCode) {
      payload.countryCode = nextCountryCode;
    }

    if (Object.keys(payload).length === 0) {
      setIsEditing(false);
      setStatusMessage(null);
      setFormState(createFormState(profile));
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/v1/me/talent-identity", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as
        | TalentIdentityDetailsDto
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "message" in body && typeof body.message === "string"
            ? body.message
            : "We couldn't save your profile changes.",
        );
      }

      const nextProfile = toProfileSnapshot(body as TalentIdentityDetailsDto);

      setProfile(nextProfile);
      setFormState(createFormState(nextProfile));
      setIsEditing(false);
      setStatusMessage({
        tone: "success",
        value: "Profile updated.",
      });
      await update({ name: nextProfile.displayName });
      startRefreshTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        value:
          error instanceof Error
            ? error.message
            : "We couldn't save your profile changes.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className={`${styles.panel} ${styles.detailsPanel}`}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderCopy}>
          <h2>Account details</h2>
          <p className={styles.panelIntro}>
            Edit the profile fields Career AI owns here. Sign-in email and provider
            details stay read-only.
          </p>
        </div>

        {!isEditing ? (
          <button
            className={styles.secondaryButton}
            onClick={() => {
              setFormState(createFormState(profile));
              setStatusMessage(null);
              setIsEditing(true);
            }}
            type="button"
          >
            Edit profile
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <p
          className={
            statusMessage.tone === "success"
              ? `${styles.inlineMessage} ${styles.inlineMessageSuccess}`
              : `${styles.inlineMessage} ${styles.inlineMessageError}`
          }
          role="status"
        >
          {statusMessage.value}
        </p>
      ) : null}

      {isEditing ? (
        <form className={styles.editorShell} onSubmit={handleSubmit}>
          <div className={styles.editorGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>First name</span>
              <input
                autoComplete="given-name"
                className={styles.fieldInput}
                disabled={isBusy}
                name="firstName"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    firstName: event.target.value,
                  }))
                }
                required
                type="text"
                value={formState.firstName}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Last name</span>
              <input
                autoComplete="family-name"
                className={styles.fieldInput}
                disabled={isBusy}
                name="lastName"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    lastName: event.target.value,
                  }))
                }
                required
                type="text"
                value={formState.lastName}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Phone</span>
              <input
                autoComplete="tel"
                className={styles.fieldInput}
                disabled={isBusy}
                name="phoneOptional"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    phoneOptional: event.target.value,
                  }))
                }
                placeholder="Optional"
                type="tel"
                value={formState.phoneOptional}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Country code</span>
              <input
                autoCapitalize="characters"
                className={styles.fieldInput}
                disabled={isBusy}
                inputMode="text"
                maxLength={2}
                name="countryCode"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    countryCode: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="US"
                type="text"
                value={formState.countryCode}
              />
              <span className={styles.fieldHint}>Use a two-letter country code.</span>
            </label>
          </div>

          <div className={styles.editorActions}>
            <button
              className={styles.ghostButton}
              disabled={isBusy}
              onClick={() => {
                setFormState(createFormState(profile));
                setStatusMessage(null);
                setIsEditing(false);
              }}
              type="button"
            >
              Cancel
            </button>
            <button className={styles.secondaryButton} disabled={isBusy} type="submit">
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      ) : null}

      <dl className={styles.detailList}>
        {detailRows.map((row) => (
          <div className={styles.detailRow} key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.isIdentifier ? styles.identifierValue : undefined}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
