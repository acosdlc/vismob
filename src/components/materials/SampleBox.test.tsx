import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SampleBox } from "./SampleBox";
import type { MaterialsSettings, SampleBoxApi, SampleItem } from "./types";

// The form is the other half of this builder's work and has its own test; here it is a
// stub that can report a sent request, so the box's states are tested on their own.
const formProps = vi.fn();
vi.mock("./SamplesForm", () => ({
  SamplesForm: (props: { onSent: () => void; items: SampleItem[]; box: SampleBoxApi }) => {
    formProps(props);
    return (
      <form data-testid="samples-form">
        <button type="button" onClick={props.onSent}>
          simulate sent
        </button>
      </form>
    );
  },
}));

const SETTINGS: MaterialsSettings = {
  sample_limit: 5,
  samples_free: "[gratuit]",
  samples_delivery: "[2–3 zile lucrătoare]",
  leg_height_cm: "[12]",
  oil_refresh_interval: "[o dată pe an]",
};

const ALL: SampleItem[] = [
  { id: "ct-verde", name: "Verde sticlă", code: "CT01", hex: "#2F4B3C", familyId: "catifea", familyName: "Catifea" },
  { id: "bc-nisip", name: "Nisip", code: "BC02", hex: "#CDBFA6", familyId: "boucle", familyName: "Bouclé" },
  { id: "sf-gri", name: "Gri deschis", code: "SF01", hex: "#B9BCBF", familyId: "stofa", familyName: "Stofă" },
  { id: "pe-coniac", name: "Coniac", code: "PE01", hex: "#8A5A35", familyId: "piele", familyName: "Piele ecologică" },
  {
    id: "lm-nuc",
    name: "Nuc",
    code: "LM03",
    hex: "#5C3F2C",
    familyId: "lemn",
    familyName: "Lemn masiv",
    photoSrc: "/mostre/lm-nuc.jpg",
  },
];

function fakeBox(ids: string[], limit = 5): SampleBoxApi {
  return {
    ids,
    limit,
    isFull: ids.length >= limit,
    hydrated: true,
    has: (id) => ids.includes(id),
    add: vi.fn(() => false),
    remove: vi.fn(),
    clear: vi.fn(),
  };
}

function setup(ids: string[], limit = 5) {
  const box = fakeBox(ids, limit);
  const items = ids.map((id) => ALL.find((i) => i.id === id)!);
  const view = render(<SampleBox items={items} box={box} settings={SETTINGS} />);
  return { ...view, box };
}

beforeEach(() => {
  formProps.mockReset();
});

describe("SampleBox", () => {
  it("renders the bar with the live counter and the empty text when nothing is chosen", () => {
    setup([]);
    const aside = screen.getByRole("complementary", { name: "Cutia cu mostre" });
    expect(aside.className).toContain("border-[1.5px]");
    expect(aside.className).toContain("bg-white");
    expect(screen.getByText("Cutia cu mostre")).toBeInTheDocument();
    const count = screen.getByTestId("box-count");
    expect(count).toHaveTextContent("0 / 5");
    expect(count).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Apasă pe mostrele care îți plac. Poți alege până la 5.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("Cutia e plină. Scoate o mostră ca să adaugi alta.")).toBeNull();
    // The form is always rendered (disabled submit while empty is the form's job).
    expect(screen.getByTestId("samples-form")).toBeInTheDocument();
    expect(formProps.mock.calls[0][0]).toMatchObject({ items: [], settings: SETTINGS });
  });

  it("lists the chosen samples with thumbnail, name, family · code and a 44px remove button", () => {
    const { box } = setup(["bc-nisip", "ct-verde", "lm-nuc"]);
    expect(screen.getByTestId("box-count")).toHaveTextContent("3 / 5");
    expect(screen.queryByText(/Apasă pe mostrele/)).toBeNull();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Nisip");
    expect(rows[0]).toHaveTextContent("Bouclé · BC02");
    expect(rows[1]).toHaveTextContent("Verde sticlă");
    expect(rows[1]).toHaveTextContent("Catifea · CT01");

    const thumbs = screen.getAllByTestId("box-thumb");
    expect(thumbs[0].className).toContain("size-9");
    expect(thumbs[0].className).toContain("tex-boucle");
    expect(thumbs[0]).toHaveStyle({ backgroundColor: "#CDBFA6" });
    // With a photo: the image, no texture.
    expect(thumbs[2].className).not.toContain("tex-lemn");
    expect(thumbs[2].querySelector("img")).not.toBeNull();

    const remove = screen.getByRole("button", { name: "Scoate Verde sticlă" });
    expect(remove.className).toContain("size-11");
    fireEvent.click(remove);
    expect(box.remove).toHaveBeenCalledWith("ct-verde");
    expect(screen.getByRole("button", { name: "Scoate Nuc" })).toBeInTheDocument();
  });

  it("says the box is full at the limit", () => {
    setup(["bc-nisip", "ct-verde"], 2);
    expect(screen.getByTestId("box-count")).toHaveTextContent("2 / 2");
    const full = screen.getByText("Cutia e plină. Scoate o mostră ca să adaugi alta.");
    expect(full.className).toContain("mono-12");
    expect(screen.getByTestId("samples-form")).toBeInTheDocument();
  });

  it("shows the confirmation once the form reports a sent request, and „Alege alte mostre” clears the box", () => {
    const { box } = setup(["bc-nisip", "ct-verde"]);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "simulate sent" }));
    });

    const heading = screen.getByRole("heading", { level: 2, name: "Gata! Pregătim cutia." });
    expect(heading.className).toContain("h3-card");
    expect(document.activeElement).toBe(heading);
    expect(
      screen.getByText("Te sunăm să confirmăm adresa. Între timp, încearcă materialele pe patul tău în configurator."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deschide configuratorul" })).toHaveAttribute("href", "/configurator");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByTestId("samples-form")).toBeNull();
    // The counter still shows the box as the store has it.
    expect(screen.getByTestId("box-count")).toHaveTextContent("2 / 5");

    fireEvent.click(screen.getByRole("button", { name: "Alege alte mostre" }));
    expect(box.clear).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Gata! Pregătim cutia.")).toBeNull();
    // Back to the list + a fresh form (the stub was mounted again).
    expect(screen.getByTestId("samples-form")).toBeInTheDocument();
    expect(formProps.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
