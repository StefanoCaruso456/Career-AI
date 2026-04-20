import { runAutonomousApplyWorkerLoop } from "@/packages/apply-runtime/src";

const abortController = new AbortController();

process.on("SIGINT", () => {
  abortController.abort();
});

process.on("SIGTERM", () => {
  abortController.abort();
});

async function main() {
  await runAutonomousApplyWorkerLoop({
    signal: abortController.signal,
  });
}

main().catch((error) => {
  console.error("Autonomous apply worker crashed.", error);
  process.exitCode = 1;
});
