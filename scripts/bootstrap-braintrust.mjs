import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flush, initLogger } from "braintrust";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const defaultBraintrustProjectName = "Career AI";
const defaultBraintrustOrgName = "Gauntlet_AI";

function loadEnvFile(fileName) {
  const filePath = path.join(repoRoot, fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function readEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const apiKey = readEnv("BRAINTRUST_API_KEY");

if (!apiKey) {
  console.error(
    "BRAINTRUST_API_KEY is required to create the Braintrust project. Add it to the shell environment or .env.local and run this command again.",
  );
  process.exit(1);
}

const projectName =
  readEnv("BRAINTRUST_PROJECT") ?? defaultBraintrustProjectName;
const orgName =
  readEnv("BRAINTRUST_ORG_NAME") ?? defaultBraintrustOrgName;

const logger = initLogger({
  apiKey,
  appUrl: readEnv("BRAINTRUST_APP_URL"),
  asyncFlush: true,
  orgName,
  projectName,
});

await logger.traced(
  async (span) => {
    span.log({
      input: {
        action: "bootstrap",
        source: "scripts/bootstrap-braintrust.mjs",
      },
      metadata: {
        orgName,
        projectName,
      },
      output: {
        status: "initialized",
      },
    });
  },
  {
    name: "braintrust.bootstrap",
    type: "task",
  },
);

await flush();

console.log(
  `Braintrust bootstrap completed for ${orgName}/${projectName}.`,
);
