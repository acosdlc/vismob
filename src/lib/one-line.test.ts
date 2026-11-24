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

  it("does not double the comma of a line that already ends with one", () => {
    // An address as it is written on two lines.
    expect(oneLine("Str. Fabricii nr. 12,\nTimișoara, jud. Timiș")).toBe("Str. Fabricii nr. 12, Timișoara, jud. Timiș");
    // A space before the comma goes with it, a semicolon counts the same, and so does the last line's.
    expect(oneLine("Str. Fabricii nr. 12 ,\r\nTimișoara;\njud. Timiș,")).toBe("Str. Fabricii nr. 12, Timișoara, jud. Timiș");
    // A line that holds nothing else is an empty line.
    expect(oneLine("Str. Fabricii nr. 12\n,\nTimișoara")).toBe("Str. Fabricii nr. 12, Timișoara");
  });

  it("answers an empty string for a text of blank lines", () => {
    expect(oneLine(" \n \r\n")).toBe("");
    expect(oneLine(" ,\n;")).toBe("");
  });
});
