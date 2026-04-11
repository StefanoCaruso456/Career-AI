import "server-only";

import { flush, initLogger, type Logger, wrapOpenAI } from "braintrust";
import OpenAI from "openai";

const defaultBraintrustProjectName = "Career AI";
const defaultBraintrustOrgName = "Gauntlet_AI";

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const braintrustProjectName =
  readEnv("BRAINTRUST_PROJECT") ?? defaultBraintrustProjectName;

export const braintrustOrgName =
  readEnv("BRAINTRUST_ORG_NAME") ?? defaultBraintrustOrgName;

const braintrustApiKey = readEnv("BRAINTRUST_API_KEY");
const braintrustAppUrl = readEnv("BRAINTRUST_APP_URL");

let loggerSingleton: Logger<true> | null | undefined;
let openAISingleton: OpenAI | undefined;

export function isBraintrustEnabled() {
  return Boolean(braintrustApiKey);
}

export function getBraintrustLogger() {
  if (loggerSingleton !== undefined) {
    return loggerSingleton;
  }

  if (!braintrustApiKey) {
    loggerSingleton = null;
    return loggerSingleton;
  }

  loggerSingleton = initLogger({
    apiKey: braintrustApiKey,
    appUrl: braintrustAppUrl,
    asyncFlush: true,
    orgName: braintrustOrgName,
    projectName: braintrustProjectName,
  });

  return loggerSingleton;
}

export function getTracedOpenAIClient(apiKey: string) {
  if (openAISingleton) {
    return openAISingleton;
  }

  const client = new OpenAI({ apiKey });

  getBraintrustLogger();
  openAISingleton = isBraintrustEnabled() ? wrapOpenAI(client) : client;

  return openAISingleton;
}

export async function flushBraintrust() {
  if (!isBraintrustEnabled()) {
    return;
  }

  await flush();
}
