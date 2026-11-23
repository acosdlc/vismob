import { describe, expect, it } from "vitest";
import { oneLine } from "./one-line";

describe("oneLine", () => {
  it("leaves a text typed on one line as it is, trimmed", () => {
    expect(oneLine("  Str. Fabricii 12, Timișoara ")).toBe("Str. Fabricii 12, Timișoara");
  });

  it("joins the lines with a comma, whatever the line ending, and drops empty lines", () => {
    expect(oneLine("Str. Fabricii 12\nTimișoara")).toBe("Str. Fabricii 12, Timișoara");
    expect(oneLine("Str. Fabricii 12 \r\n\r\n Timișoara\rjud. Timiș")).toBe("Str. Fabricii 12, Timișoara, jud. Timiș");
  });

  it("answers an empty string for a text of blank lines", () => {
    expect(oneLine(" \n \r\n")).toBe("");
  });
});
