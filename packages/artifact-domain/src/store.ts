import type { ArtifactMetadata } from "@/packages/contracts/src";

type ArtifactStore = {
  artifactsById: Map<string, ArtifactMetadata>;
  contentsById: Map<string, Buffer>;
  artifactIdsByClaimId: Map<string, string[]>;
};

declare global {
  // eslint-disable-next-line no-var
  var __taidArtifactStore: ArtifactStore | undefined;
}

function createStore(): ArtifactStore {
  return {
    artifactsById: new Map(),
    contentsById: new Map(),
    artifactIdsByClaimId: new Map(),
  };
}

export function getArtifactStore(): ArtifactStore {
  if (!globalThis.__taidArtifactStore) {
    globalThis.__taidArtifactStore = createStore();
  }

  return globalThis.__taidArtifactStore;
}

export function resetArtifactStore() {
  globalThis.__taidArtifactStore = createStore();
}
