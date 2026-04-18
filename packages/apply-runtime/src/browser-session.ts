import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export type ApplyBrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
};

export async function launchApplyBrowserSession(args: {
  runId: string;
}): Promise<ApplyBrowserSession> {
  const wsEndpoint = process.env.AUTONOMOUS_APPLY_PLAYWRIGHT_WS_ENDPOINT?.trim() || null;
  const browser = wsEndpoint
    ? await chromium.connect(wsEndpoint)
    : await chromium.launch({
        headless: true,
      });
  const context = await browser.newContext({
    acceptDownloads: false,
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    sessionId: `apply_browser_${args.runId}`,
  };
}

export async function closeApplyBrowserSession(session: ApplyBrowserSession | null | undefined) {
  if (!session) {
    return;
  }

  await session.context.close().catch(() => undefined);
  await session.browser.close().catch(() => undefined);
}
