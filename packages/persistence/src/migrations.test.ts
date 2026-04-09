import { afterEach, describe, expect, it, vi } from "vitest";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  vi.resetModules();

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }

  process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("runDatabaseMigrationsCli", () => {
  it("skips migrations when DATABASE_URL is not configured", async () => {
    delete process.env.DATABASE_URL;

    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    };
    const { runDatabaseMigrationsCli } = await import("./migrations");

    await expect(runDatabaseMigrationsCli(logger)).resolves.toEqual({
      skipped: true,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Skipping database migrations because DATABASE_URL is not configured.",
    );
    expect(logger.log).not.toHaveBeenCalled();
  });
});
