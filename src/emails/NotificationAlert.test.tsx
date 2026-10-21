// @vitest-environment node
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { alertSubject, FAILED_EMAIL_LABELS, NotificationAlert } from "./NotificationAlert";
import { PLAIN_TEXT_OPTIONS } from "./shared";

const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_URL = `https://www.vismob.dev/admin/cereri/${LEAD_ID}`;

describe("NotificationAlert", () => {
  it("names the failed email, the request, the attempts and the error, and links the request in the admin", async () => {
    const html = await render(
      <NotificationAlert
        leadId={LEAD_ID}
        leadName="Ștefan Țăranu"
        configCode="CAP-160x200-CT01-H120-LD-LED"
        type="email_client"
        error="validation_error: Invalid `to` field"
        attempts={3}
        adminUrl={ADMIN_URL}
      />,
    );
    expect(html).toContain('lang="ro"');
    expect(html).toContain("Alertă");
    expect(html).toContain("Notificare eșuată");
    expect(html).toContain(
      "Emailul de confirmare către client pentru cererea CAP-160x200-CT01-H120-LD-LED (Ștefan Țăranu) a eșuat de 3 ori.",
    );
    expect(html).toContain("Nu se mai reîncearcă automat");
    expect(html).toContain("validation_error: Invalid `to` field");
    expect(html).toContain(`href="${ADMIN_URL}"`);
    expect(html).toContain("Deschide cererea");
    expect(html).toContain(`Cerere ${LEAD_ID}`);

    const text = await render(
      <NotificationAlert
        leadId={LEAD_ID}
        leadName="Ștefan Țăranu"
        configCode="CAP-160x200-CT01-H120-LD-LED"
        type="email_client"
        error="validation_error"
        attempts={3}
        adminUrl={ADMIN_URL}
      />,
      PLAIN_TEXT_OPTIONS,
    );
    expect(text).toContain("NOTIFICARE EȘUATĂ");
    expect(text).toContain(ADMIN_URL);
  });

  it("names the workshop email and falls back to the client's name without a code", async () => {
    const html = await render(
      <NotificationAlert
        leadId={LEAD_ID}
        leadName="Ana Pop"
        configCode={null}
        type="email_workshop"
        error="NOTIFY_EMAIL missing"
        attempts={3}
        adminUrl={ADMIN_URL}
      />,
    );
    expect(html).toContain("Emailul către atelier pentru cererea Ana Pop a eșuat de 3 ori.");
    expect(html).toContain("NOTIFY_EMAIL missing");
    expect(html).not.toContain("()");
  });

  it("builds the subject from the code, then the name, on one header line", () => {
    expect(alertSubject({ name: "Ștefan Țăranu", config_code: "CAP-160x200-CT01-H120-LD-LED" })).toBe(
      "Notificare eșuată · CAP-160x200-CT01-H120-LD-LED",
    );
    expect(alertSubject({ name: "Ana Pop", config_code: null })).toBe("Notificare eșuată · Ana Pop");
    expect(alertSubject({ name: "Ana\r\nPop", config_code: "" })).toBe("Notificare eșuată · Ana Pop");
    expect(Object.keys(FAILED_EMAIL_LABELS).sort()).toEqual(["email_client", "email_workshop"]);
  });
});
