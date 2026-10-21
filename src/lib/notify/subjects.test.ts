// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clientSubject, workshopSubject } from "./subjects";

describe("workshopSubject", () => {
  it("names the code, the client and the city for a configurator lead", () => {
    expect(
      workshopSubject({
        kind: "configurator",
        name: "Ștefan Țăranu",
        city: "Timișoara",
        config_code: "CAP-160x200-CT01-H120-LD-LED",
      }),
    ).toBe("Cerere nouă · CAP-160x200-CT01-H120-LD-LED · Ștefan Țăranu, Timișoara");
  });

  it("drops the code for a contact lead and the city when it is missing", () => {
    expect(workshopSubject({ kind: "contact", name: "Ana Pop", city: "Iași", config_code: null })).toBe(
      "Cerere nouă · Ana Pop, Iași",
    );
    expect(workshopSubject({ kind: "contact", name: "Ana Pop", city: null, config_code: null })).toBe(
      "Cerere nouă · Ana Pop",
    );
    expect(workshopSubject({ kind: "contact", name: "Ana Pop", city: "", config_code: "" })).toBe(
      "Cerere nouă · Ana Pop",
    );
  });

  it("keeps the subject on one line whatever the client typed", () => {
    expect(
      workshopSubject({ kind: "contact", name: "Ana\r\nBcc: x@y.ro", city: "Cluj\u0000Napoca  ", config_code: null }),
    ).toBe("Cerere nouă · Ana Bcc: x@y.ro, Cluj Napoca");
    expect(clientSubject({ kind: "configurator", config_code: "CAP-160\nX" })).toBe("Am primit cererea ta · CAP-160 X");
  });

});

describe("clientSubject", () => {
  it("adds the code only when there is one", () => {
    expect(clientSubject({ kind: "configurator", config_code: "ARC-180x200-BC02-H100-ML" })).toBe(
      "Am primit cererea ta · ARC-180x200-BC02-H100-ML",
    );
    expect(clientSubject({ kind: "contact", config_code: null })).toBe("Am primit cererea ta");
  });

});
