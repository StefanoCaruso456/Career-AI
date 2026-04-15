"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { mergeApplicationProfiles, mergeProfileWithDefaults } from "@/lib/application-profiles/defaults";
import {
  mergeRemoteProfilesWithCache,
  readCachedApplicationProfiles,
  writeCachedApplicationProfiles,
} from "@/lib/application-profiles/storage";
import type {
  AnyApplicationProfile,
  ApplicationProfiles,
  ResumeAssetReference,
  SchemaFamily,
} from "@/lib/application-profiles/types";

type StoreSnapshot = {
  hydrated: boolean;
  persisted: boolean;
  profiles: ApplicationProfiles;
};

const storeByUser = new Map<string, StoreSnapshot>();
const listenersByUser = new Map<string, Set<(snapshot: StoreSnapshot) => void>>();
const inflightLoads = new Map<string, Promise<StoreSnapshot>>();

function ensureStore(userKey: string): StoreSnapshot {
  const existing = storeByUser.get(userKey);

  if (existing) {
    return existing;
  }

  const nextSnapshot: StoreSnapshot = {
    hydrated: false,
    persisted: false,
    profiles: readCachedApplicationProfiles(userKey),
  };

  storeByUser.set(userKey, nextSnapshot);
  return nextSnapshot;
}

function broadcastStore(userKey: string, snapshot: StoreSnapshot) {
  storeByUser.set(userKey, snapshot);
  writeCachedApplicationProfiles(userKey, snapshot.profiles);

  listenersByUser.get(userKey)?.forEach((listener) => {
    listener(snapshot);
  });
}

function subscribe(userKey: string, listener: (snapshot: StoreSnapshot) => void) {
  const listeners = listenersByUser.get(userKey) ?? new Set<(snapshot: StoreSnapshot) => void>();
  listeners.add(listener);
  listenersByUser.set(userKey, listeners);

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      listenersByUser.delete(userKey);
    }
  };
}

async function loadProfilesFromServer(userKey: string) {
  const existingRequest = inflightLoads.get(userKey);

  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch("/api/v1/me/application-profiles", {
    headers: {
      "content-type": "application/json",
    },
    method: "GET",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Unable to load your saved application profiles.");
      }

      const payload = (await response.json()) as {
        persisted: boolean;
        profiles: Record<string, unknown>;
      };
      const remoteProfiles = mergeApplicationProfiles(payload.profiles);
      const mergedProfiles = mergeRemoteProfilesWithCache(userKey, remoteProfiles);
      const snapshot: StoreSnapshot = {
        hydrated: true,
        persisted: Boolean(payload.persisted),
        profiles: mergedProfiles,
      };

      broadcastStore(userKey, snapshot);

      return snapshot;
    })
    .finally(() => {
      inflightLoads.delete(userKey);
    });

  inflightLoads.set(userKey, request);
  return request;
}

export function useApplicationProfiles() {
  const { data: session, status } = useSession();
  const userKey = session?.user?.appUserId ?? session?.user?.email ?? "anonymous";
  const [storeSnapshot, setStoreSnapshot] = useState<StoreSnapshot>(() => ensureStore(userKey));
  const [isLoading, setIsLoading] = useState(
    status === "authenticated" && !ensureStore(userKey).hydrated,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStoreSnapshot(ensureStore(userKey));
    setIsLoading(status === "authenticated" && !ensureStore(userKey).hydrated);

    return subscribe(userKey, (nextSnapshot) => {
      setStoreSnapshot(nextSnapshot);
    });
  }, [status, userKey]);

  useEffect(() => {
    if (status !== "authenticated") {
      setIsLoading(false);
      return;
    }

    if (ensureStore(userKey).hydrated) {
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);

    void loadProfilesFromServer(userKey)
      .catch((loadError) => {
        if (!isActive) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load your saved application profiles.");
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [status, userKey]);

  async function saveProfile(args: {
    profile: AnyApplicationProfile;
    schemaFamily: SchemaFamily;
  }) {
    const normalizedProfile = mergeProfileWithDefaults(args.schemaFamily, args.profile);
    const optimisticProfiles = {
      ...ensureStore(userKey).profiles,
      [`${args.schemaFamily}_profile`]: normalizedProfile,
    } as ApplicationProfiles;

    broadcastStore(userKey, {
      ...ensureStore(userKey),
      hydrated: true,
      profiles: optimisticProfiles,
    });
    setIsSaving(true);
    setError(null);

    try {
      if (status !== "authenticated" || !session?.user?.appUserId) {
        return normalizedProfile;
      }

      const response = await fetch("/api/v1/me/application-profiles", {
        body: JSON.stringify({
          profile: normalizedProfile,
          schemaFamily: args.schemaFamily,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "PUT",
      });

      if (!response.ok) {
        throw new Error("We couldn't save your profile right now.");
      }

      const payload = (await response.json()) as {
        persisted: boolean;
        profiles: Record<string, unknown>;
      };
      const nextSnapshot: StoreSnapshot = {
        hydrated: true,
        persisted: Boolean(payload.persisted),
        profiles: mergeRemoteProfilesWithCache(
          userKey,
          mergeApplicationProfiles(payload.profiles),
        ),
      };

      broadcastStore(userKey, nextSnapshot);
      return nextSnapshot.profiles[`${args.schemaFamily}_profile` as keyof ApplicationProfiles] as AnyApplicationProfile;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "We couldn't save your profile right now.",
      );
      throw saveError;
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadResume(file: File): Promise<ResumeAssetReference> {
    if (status !== "authenticated" || !session?.user?.appUserId) {
      throw new Error("Sign in before uploading a reusable resume.");
    }

    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch("/api/v1/me/application-profiles/resume", {
      body: formData,
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("We couldn't upload that resume right now.");
    }

    return (await response.json()) as ResumeAssetReference;
  }

  return {
    error,
    isAuthenticated: status === "authenticated",
    isLoading,
    isSaving,
    persisted: storeSnapshot.persisted,
    profiles: storeSnapshot.profiles,
    saveProfile,
    uploadResume,
    userKey,
  };
}
