import { expect, test } from "@playwright/test";

// PR-10: the cron route fails closed. The container has no CRON_SECRET, so every
// job answers 503 `{ error: "unavailable" }`; against a deployment that has the
// secret, a call without the header is 401. Neither is ever 200.

test("GET /api/cron/retention without the secret is refused, never 200", async ({ request }) => {
  const response = await request.get("/api/cron/retention");
  expect(response.status()).not.toBe(200);
  expect([401, 503]).toContain(response.status());
  const body = await response.json();
  if (response.status() === 503) expect(body).toEqual({ error: "unavailable" });
  else expect(body).toEqual({ error: "unauthorized" });
});

test("GET /api/cron/nope with no header is not 200", async ({ request }) => {
  const response = await request.get("/api/cron/nope");
  expect([401, 503]).toContain(response.status());
});
