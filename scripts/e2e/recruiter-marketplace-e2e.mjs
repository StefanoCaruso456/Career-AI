import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { Client } from "pg";

const BASE_URL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3100";
const SCREENSHOT_DIR =
  process.env.E2E_SCREENSHOT_DIR?.trim() || ".artifacts/e2e/recruiter-marketplace";
const TEST_EMAIL =
  process.env.E2E_RECRUITER_MARKETPLACE_EMAIL?.trim() ||
  "e2e.recruiter.marketplace@example.com";
const TEST_PASSWORD =
  process.env.E2E_RECRUITER_MARKETPLACE_PASSWORD?.trim() || "StrongPass123!";
const TEST_NAME = process.env.E2E_RECRUITER_MARKETPLACE_NAME?.trim() || "E2E Recruiter QA";
const DATABASE_URL = process.env.DATABASE_URL?.trim();

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run recruiter marketplace E2E QA.");
}

async function requestJson(api, method, path, options = {}) {
  const response = await api.fetch(`${BASE_URL}${path}`, {
    data: options.data,
    headers: options.headers,
    method,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    payload,
    response,
    status: response.status(),
  };
}

async function registerCredentialUser(api) {
  const { status } = await requestJson(api, "POST", "/api/auth/register", {
    data: {
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
    },
    headers: {
      "content-type": "application/json",
    },
  });

  assert(
    status === 201 || status === 409,
    `Expected register status 201/409, received ${status}.`,
  );
}

async function loginWithCredentials(api) {
  const csrfResponse = await requestJson(api, "GET", "/api/auth/csrf");
  assert.equal(csrfResponse.status, 200, "Failed to load NextAuth CSRF token.");
  const csrfToken = csrfResponse.payload?.csrfToken;
  assert.equal(typeof csrfToken, "string", "Missing CSRF token.");

  const loginResponse = await api.fetch(`${BASE_URL}/api/auth/callback/credentials?json=true`, {
    form: {
      callbackUrl: `${BASE_URL}/jobs`,
      csrfToken,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
    maxRedirects: 0,
    method: "POST",
  });

  assert.equal(loginResponse.status(), 302, "Credentials login did not return redirect status.");

  const session = await requestJson(api, "GET", "/api/auth/session");
  assert.equal(session.status, 200, "Unable to read authenticated session.");
  assert.equal(
    session.payload?.user?.email?.toLowerCase(),
    TEST_EMAIL.toLowerCase(),
    "Authenticated session email mismatch.",
  );
  assert.equal(
    typeof session.payload?.user?.talentIdentityId,
    "string",
    "Session missing talentIdentityId.",
  );

  return {
    seekerCareerIdentityId: session.payload.user.talentIdentityId,
  };
}

async function ensureDeterministicProfile(client, seekerCareerIdentityId) {
  await client.query(
    `
      INSERT INTO career_builder_profiles (
        career_identity_id,
        legal_name,
        career_headline,
        target_role,
        location,
        core_narrative
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (career_identity_id)
      DO UPDATE SET
        legal_name = EXCLUDED.legal_name,
        career_headline = EXCLUDED.career_headline,
        target_role = EXCLUDED.target_role,
        location = EXCLUDED.location,
        core_narrative = EXCLUDED.core_narrative,
        updated_at = NOW()
    `,
    [
      seekerCareerIdentityId,
      "E2E Recruiter QA",
      "Senior platform engineer for AI systems",
      "Staff backend engineer",
      "Chicago, IL",
      "Built permissioned retrieval systems, job search APIs, and identity-aware matching services.",
    ],
  );
}

function assertEventShape(event) {
  assert.equal(typeof event.sender_agent_id, "string");
  assert.equal(typeof event.receiver_agent_id, "string");
  assert.equal(typeof event.recruiter_career_identity_id, "string");
  assert.equal(typeof event.seeker_career_identity_id, "string");
  assert.equal(typeof event.message_type, "string");
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: {
      height: 900,
      width: 1440,
    },
  });
  const page = await context.newPage();
  const api = context.request;

  const db = new Client({
    connectionString: DATABASE_URL,
  });
  await db.connect();

  try {
    await registerCredentialUser(api);
    const { seekerCareerIdentityId } = await loginWithCredentials(api);
    await ensureDeterministicProfile(db, seekerCareerIdentityId);
    await db.query(
      `
        DELETE FROM recruiter_protocol_events
        WHERE seeker_career_identity_id = $1
      `,
      [seekerCareerIdentityId],
    );
    await db.query(
      `
        DELETE FROM recruiter_conversation_messages
        WHERE job_seeker_career_identity_id = $1
      `,
      [seekerCareerIdentityId],
    );
    await db.query(
      `
        DELETE FROM recruiter_conversations
        WHERE job_seeker_career_identity_id = $1
      `,
      [seekerCareerIdentityId],
    );
    await db.query(
      `
        DELETE FROM recruiter_access_grants
        WHERE job_seeker_career_identity_id = $1
      `,
      [seekerCareerIdentityId],
    );

    await page.goto("/jobs", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await page.getByRole("heading", { name: "Recruiter Marketplace" }).waitFor();
    await page.screenshot({
      path: join(SCREENSHOT_DIR, "01-jobs-page-recruiter-marketplace.png"),
      fullPage: true,
    });

    const partnerSelect = page.locator("#recruiter-partner-select");
    await partnerSelect.selectOption("emp_stripe");

    const recruitersResponse = await requestJson(
      api,
      "GET",
      "/api/v1/employer-partners/emp_stripe/recruiters",
    );
    assert.equal(recruitersResponse.status, 200, "Recruiter list endpoint failed.");
    assert.ok(
      Array.isArray(recruitersResponse.payload?.items) &&
        recruitersResponse.payload.items.length > 0,
      "No seeded recruiters returned for Stripe.",
    );

    const recruiterA = recruitersResponse.payload.items[0];
    const recruiterBResponse = await requestJson(
      api,
      "GET",
      "/api/v1/employer-partners/emp_adobe/recruiters",
    );
    assert.equal(recruiterBResponse.status, 200, "Secondary recruiter list endpoint failed.");
    assert.ok(
      Array.isArray(recruiterBResponse.payload?.items) &&
        recruiterBResponse.payload.items.length > 0,
      "No seeded recruiters returned for Adobe.",
    );
    const recruiterB = recruiterBResponse.payload.items[0];

    await page.getByRole("button", { name: recruiterA.displayName }).click();
    await page.getByRole("heading", { name: recruiterA.displayName }).waitFor();

    const jobsBeforeGrant = await requestJson(
      api,
      "GET",
      `/api/v1/recruiters/${recruiterA.id}/jobs`,
    );
    assert.equal(jobsBeforeGrant.status, 403, "Jobs endpoint should be blocked before grant.");

    const chatBeforeGrant = await requestJson(
      api,
      "POST",
      `/api/v1/recruiters/${recruiterA.id}/chat`,
      {
        data: {
          message: "Which roles align with my background?",
          mode: "recruiter_jobs",
        },
        headers: {
          "content-type": "application/json",
        },
      },
    );
    assert.equal(chatBeforeGrant.status, 403, "Chat endpoint should be blocked before grant.");

    await page.screenshot({
      path: join(SCREENSHOT_DIR, "02-before-access-request.png"),
      fullPage: true,
    });

    await page
      .getByRole("button", { name: "Request recruiter access" })
      .click();
    await page.getByText("Approved").waitFor();

    const accessStatus = await requestJson(
      api,
      "GET",
      `/api/v1/recruiters/${recruiterA.id}/access-status`,
    );
    assert.equal(accessStatus.status, 200, "Access status endpoint failed.");
    assert.equal(accessStatus.payload?.hasAccess, true, "Access grant was not approved.");
    assert.equal(accessStatus.payload?.grant?.status, "approved");
    assert.equal(
      typeof accessStatus.payload?.grant?.id,
      "string",
      "Approved grant missing id.",
    );
    const approvedGrantId = accessStatus.payload.grant.id;

    const jobsAfterGrant = await requestJson(
      api,
      "GET",
      `/api/v1/recruiters/${recruiterA.id}/jobs`,
    );
    assert.equal(jobsAfterGrant.status, 200, "Jobs endpoint failed after grant.");
    assert.equal(jobsAfterGrant.payload?.jobs?.length, 10, "Expected exactly 10 seeded recruiter jobs.");
    const authorizedJobIds = new Set(jobsAfterGrant.payload.jobs.map((job) => job.id));

    await page
      .locator("section", { hasText: "Recruiter-owned openings" })
      .getByText("10 roles", { exact: true })
      .waitFor();
    await page.screenshot({
      path: join(SCREENSHOT_DIR, "03-after-access-approved-jobs-visible.png"),
      fullPage: true,
    });

    const firstJobId = jobsAfterGrant.payload.jobs[0].id;
    const jobDetail = await requestJson(
      api,
      "GET",
      `/api/v1/recruiters/${recruiterA.id}/jobs/${firstJobId}`,
    );
    assert.equal(jobDetail.status, 200, "Recruiter job detail endpoint failed.");
    assert.equal(jobDetail.payload?.job?.id, firstJobId, "Job detail mismatch.");

    await page.getByRole("button", { name: "Run match" }).click();
    await page.getByText(/Score \d+%/).first().waitFor();

    const matchResponse = await requestJson(
      api,
      "POST",
      `/api/v1/recruiters/${recruiterA.id}/match-career-id`,
      {
        data: {
          limit: 5,
        },
        headers: {
          "content-type": "application/json",
        },
      },
    );
    assert.equal(matchResponse.status, 200, "Match endpoint failed.");
    assert.ok(
      Array.isArray(matchResponse.payload?.results) &&
        matchResponse.payload.results.length > 0,
      "Match endpoint returned no results.",
    );

    await page.screenshot({
      path: join(SCREENSHOT_DIR, "04-match-results.png"),
      fullPage: true,
    });

    await page.getByLabel("Recruiter chat message").fill(
      "What open roles from this recruiter align best with my platform engineering background?",
    );
    await page.getByRole("button", { name: "Send" }).click();
    await page
      .locator("article")
      .filter({ hasText: "Recruiter" })
      .first()
      .waitFor();

    const chatResponse = await requestJson(
      api,
      "POST",
      `/api/v1/recruiters/${recruiterA.id}/chat`,
      {
        data: {
          message:
            "Summarize the top recruiter-owned openings and keep recommendations inside my approved scope.",
          mode: "recruiter_jobs",
        },
        headers: {
          "content-type": "application/json",
        },
      },
    );
    assert.equal(chatResponse.status, 200, "Recruiter chat endpoint failed.");
    const citations = chatResponse.payload?.assistantMessage?.citations ?? [];
    assert.ok(Array.isArray(citations) && citations.length > 0, "Chat response returned no citations.");
    for (const citation of citations) {
      assert.equal(
        citation.recruiterCareerIdentityId,
        recruiterA.id,
        "Chat citation leaked a different recruiter identity.",
      );
      assert.ok(
        authorizedJobIds.has(citation.jobId),
        `Chat citation job ${citation.jobId} is outside authorized recruiter jobs.`,
      );
    }

    const crossRecruiterChat = await requestJson(
      api,
      "POST",
      `/api/v1/recruiters/${recruiterB.id}/chat`,
      {
        data: {
          message: "Show me your roles.",
          mode: "recruiter_jobs",
        },
        headers: {
          "content-type": "application/json",
        },
      },
    );
    assert.equal(
      crossRecruiterChat.status,
      403,
      "Cross-recruiter chat should be denied when no grant exists.",
    );

    await page.screenshot({
      path: join(SCREENSHOT_DIR, "05-chat-response.png"),
      fullPage: true,
    });

    await db.query(
      `
        UPDATE recruiter_access_grants
        SET
          status = 'revoked',
          revoked_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [approvedGrantId],
    );

    const jobsAfterRevocation = await requestJson(
      api,
      "GET",
      `/api/v1/recruiters/${recruiterA.id}/jobs`,
    );
    assert.equal(
      jobsAfterRevocation.status,
      403,
      "Jobs endpoint should deny access after grant revocation.",
    );

    const chatAfterRevocation = await requestJson(
      api,
      "POST",
      `/api/v1/recruiters/${recruiterA.id}/chat`,
      {
        data: {
          message: "Can I still access jobs?",
          mode: "recruiter_jobs",
        },
        headers: {
          "content-type": "application/json",
        },
      },
    );
    assert.equal(
      chatAfterRevocation.status,
      403,
      "Chat endpoint should deny access after grant revocation.",
    );

    const protocolEventsResult = await db.query(
      `
        SELECT
          id,
          message_type,
          sender_agent_id,
          receiver_agent_id,
          recruiter_career_identity_id,
          seeker_career_identity_id,
          access_grant_id,
          request_id,
          run_id,
          lifecycle_state,
          success,
          created_at
        FROM recruiter_protocol_events
        WHERE recruiter_career_identity_id = $1
          AND seeker_career_identity_id = $2
        ORDER BY created_at ASC, id ASC
      `,
      [recruiterA.id, seekerCareerIdentityId],
    );
    assert.ok(protocolEventsResult.rows.length > 0, "No recruiter protocol events were persisted.");
    protocolEventsResult.rows.forEach(assertEventShape);

    const messageTypes = new Set(protocolEventsResult.rows.map((row) => row.message_type));
    [
      "recruiter_access_request",
      "recruiter_access_approved",
      "recruiter_fit_evaluation_request",
      "recruiter_recommendation_response",
      "recruiter_conversation_follow_up",
    ].forEach((type) => {
      assert.ok(messageTypes.has(type), `Missing protocol event type: ${type}`);
    });
    assert.ok(
      messageTypes.has("recruiter_access_denied"),
      "Expected denied protocol event from negative-path checks.",
    );

    const hasGrantLinkedEvent = protocolEventsResult.rows.some(
      (row) => row.access_grant_id === approvedGrantId,
    );
    assert.ok(hasGrantLinkedEvent, "No protocol event linked to the tested access grant.");

    console.log("E2E recruiter marketplace QA pass: SUCCESS");
    console.log(
      JSON.stringify(
        {
          accessGrantId: approvedGrantId,
          chatCitationJobIds: citations.map((citation) => citation.jobId),
          protocolEventCount: protocolEventsResult.rows.length,
          protocolMessageTypes: Array.from(messageTypes),
          recruiterCareerIdentityId: recruiterA.id,
          seekerCareerIdentityId,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.end();
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("E2E recruiter marketplace QA pass failed.");
  console.error(error);
  process.exitCode = 1;
});
