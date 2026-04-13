import {
  type W3CPresentationEnvelope,
  type W3CPresentationSummary,
  w3cPresentationSummarySchema,
} from "@/packages/contracts/src";

export type W3CPresentationAdapter = {
  summarize: (envelope?: W3CPresentationEnvelope | null) => W3CPresentationSummary | null;
};

export const defaultW3CPresentationAdapter: W3CPresentationAdapter = {
  summarize(envelope) {
    if (!envelope) {
      return null;
    }

    return w3cPresentationSummarySchema.parse({
      challenge: envelope.challenge ?? null,
      definitionId: envelope.definitionId ?? null,
      descriptorIds: envelope.descriptorIds ?? [],
      format: envelope.format ?? null,
      hasPresentation: Boolean(envelope.presentation),
      holderDid: envelope.holderDid ?? null,
    });
  },
};
