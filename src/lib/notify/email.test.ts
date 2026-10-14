// @vitest-environment node
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("resend", () => ({
  Resend: vi.fn(function Resend(this: { emails: { send: typeof sendMock } }) {
    this.emails = { send: sendMock };
  }),
}));

import { Resend } from "resend";
import { FALLBACK_FROM, fromAddress, sendEmail } from "./email";

const SECRET_BODY = "Mesajul clientului, care nu are ce căuta în loguri";
const input = () => ({
  to: "client@example.com",
  subject: "Am primit cererea ta · CAP-160x200-CT01-H120-LD",
  react: createElement("p", null, SECRET_BODY),
});

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("NOTIFY_DRY_RUN", "");
  vi.stubEnv("VERCEL_ENV", "");
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "re_123" }, error: null, headers: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendEmail", () => {
  it("dry-runs without RESEND_API_KEY, logging only the recipient and the subject", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await sendEmail(input());
    expect(result).toEqual({ ok: true, dryRun: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line).toContain("client@example.com");
    expect(line).toContain("Am primit cererea ta");
    expect(line).not.toContain(SECRET_BODY);
  });

  it("dry-runs with NOTIFY_DRY_RUN=1 even when the key is set", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("NOTIFY_DRY_RUN", "1");
    expect(await sendEmail(input())).toEqual({ ok: true, dryRun: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(Resend).not.toHaveBeenCalled();
  });

  it("sends through Resend with the fallback sender outside production", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("VERCEL_ENV", "preview");
    const result = await sendEmail({
      ...input(),
      replyTo: "atelier@example.com",
      attachments: [{ filename: "desen.png", content: Buffer.from("png") }],
    });
    expect(result).toEqual({ ok: true, id: "re_123" });
    expect(Resend).toHaveBeenCalledWith("re_test");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      from: FALLBACK_FROM,
      to: "client@example.com",
      subject: "Am primit cererea ta · CAP-160x200-CT01-H120-LD",
      replyTo: "atelier@example.com",
    });
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe("desen.png");
    expect(payload.html).toContain(`<p>${SECRET_BODY}</p>`);
    expect(payload.text).toContain(SECRET_BODY);
    expect(payload.text).not.toContain("<p>");
  });

  it("uses EMAIL_FROM when it is set", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Atelier <cereri@domeniu.ro>");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await sendEmail(input())).toEqual({ ok: true, id: "re_123" });
    expect(sendMock.mock.calls[0][0].from).toBe("Atelier <cereri@domeniu.ro>");
  });

  it("fails closed in production without EMAIL_FROM, naming the variable", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("VERCEL_ENV", "production");
    const result = await sendEmail(input());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("EMAIL_FROM");
    expect(sendMock).not.toHaveBeenCalled();
    expect(() => fromAddress()).toThrow(/EMAIL_FROM/);
  });

  it("returns Resend's error instead of throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field", statusCode: 422 },
      headers: null,
    });
    expect(await sendEmail(input())).toEqual({ ok: false, error: "validation_error: Invalid `to` field" });
  });

  it("catches a network failure", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    sendMock.mockRejectedValueOnce(new Error("fetch failed"));
    expect(await sendEmail(input())).toEqual({ ok: false, error: "fetch failed" });
  });
});
