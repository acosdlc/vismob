import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import type { Base, BaseId } from "@/lib/configurator/types";
import { BasesCards, shownBaseCards } from "./BasesCards";

/** The seed's bases without the ones named: what the public catalogue holds once they are switched off. */
const without = (...ids: BaseId[]): Base[] => SEED_CATALOG.bases.filter((b) => !ids.includes(b.id));

const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("shownBaseCards", () => {
  it("is the three cards of DESIGN §4.3 while every base is offered", () => {
    expect(shownBaseCards(SEED_CATALOG.bases).map((c) => c.id)).toEqual(["lemn", "metal", "podea"]);
  });

  it("drops a card when none of its bases is in the catalogue", () => {
    expect(shownBaseCards(without("lemn")).map((c) => c.id)).toEqual(["metal", "podea"]);
    expect(shownBaseCards(without("metal")).map((c) => c.id)).toEqual(["lemn", "podea"]);
    // The floor base stands for both storage bases: it goes only when both are off.
    expect(shownBaseCards(without("lada")).map((c) => c.id)).toEqual(["lemn", "metal", "podea"]);
    expect(shownBaseCards(without("sertare")).map((c) => c.id)).toEqual(["lemn", "metal", "podea"]);
    expect(shownBaseCards(without("lada", "sertare")).map((c) => c.id)).toEqual(["lemn", "metal"]);
    expect(shownBaseCards([])).toEqual([]);
  });
});

describe("BasesCards", () => {
  it("shows the three cards, sharing the row, while every base is offered", () => {
    render(<BasesCards bases={SEED_CATALOG.bases} legHeightCm="[12]" />);
    expect(titles()).toEqual(["Picioare din lemn", "Picioare metalice", "Bază până la podea"]);
    expect(screen.getByText("Stejar masiv, înălțime [12] cm, finisaj ca tăblia.")).toBeInTheDocument();
    expect(screen.getAllByText("FOTO")).toHaveLength(3);
    expect(screen.getByRole("list").className).toContain("grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))]");
  });

  it("leaves out the card of a base that is switched off, instead of a FOTO box over it", () => {
    render(<BasesCards bases={without("metal")} legHeightCm="[12]" />);
    expect(titles()).toEqual(["Picioare din lemn", "Bază până la podea"]);
    expect(screen.queryByText("Picior metalic")).not.toBeInTheDocument();
    expect(screen.queryByText("Oțel vopsit negru mat, înălțime [12] cm.")).not.toBeInTheDocument();
    expect(screen.getAllByText("FOTO")).toHaveLength(2);
  });

  it("keeps the floor-base card for the storage base that is left, with its photo", () => {
    const bases = without("lada").map((b) => (b.id === "sertare" ? { ...b, photoSrc: "/baze/sertare.jpg" } : b));
    render(<BasesCards bases={bases} legHeightCm="[12]" />);
    expect(titles()).toEqual(["Picioare din lemn", "Picioare metalice", "Bază până la podea"]);
    expect(screen.getByRole("img", { name: "Bază până la podea" })).toBeInTheDocument();
    expect(screen.getAllByText("FOTO")).toHaveLength(2);
  });

  it("keeps a card at a card's width when fewer than three show", () => {
    // jsdom lays nothing out, so the track rule itself is checked: auto-fit would let the
    // one or two cards left take the whole row; auto-fill keeps three tracks.
    const { unmount } = render(<BasesCards bases={without("metal")} legHeightCm="[12]" />);
    expect(screen.getByRole("list").className).toContain("repeat(auto-fill,");
    expect(screen.getByRole("list").className).not.toContain("auto-fit");
    unmount();

    render(<BasesCards bases={without("metal", "lada", "sertare")} legHeightCm="[12]" />);
    expect(titles()).toEqual(["Picioare din lemn"]);
    expect(screen.getByRole("list").className).toContain("repeat(auto-fill,");
  });
});
