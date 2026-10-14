import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import {
  Checkbox,
  Field,
  FieldError,
  FileInput,
  FormCard,
  Input,
  Label,
  Select,
  Textarea,
  describedBy,
  fieldErrorId,
} from "./index";

describe("Input", () => {
  it("is a labelled native input with the §3.16 box", () => {
    render(
      <Field>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toBeRequired();
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input.className).toContain("min-h-12");
    expect(input.className).toContain("border-field");
    expect(input.className).toContain("text-[16px]");
  });

  it("with an error sets aria-invalid, aria-describedby and the error border", () => {
    render(
      <Field>
        <Label htmlFor="phone">Telefon</Label>
        <Input id="phone" invalid />
        <FieldError fieldId="phone">Numărul de telefon nu e valid.</FieldError>
      </Field>,
    );
    const input = screen.getByLabelText("Telefon");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "phone-error");
    expect(input.className).toContain("border-error");
    expect(input).toHaveAccessibleDescription("Numărul de telefon nu e valid.");

    const error = screen.getByText("Numărul de telefon nu e valid.");
    expect(error.id).toBe(fieldErrorId("phone"));
    expect(error.className).toContain("text-error");
    expect(error.className).toContain("text-[14px]");
  });

  it("keeps the caller's aria-describedby in front of the error id", () => {
    render(
      <>
        <p id="name-hint">Numele complet</p>
        <Input id="name" aria-label="Nume" aria-describedby="name-hint" invalid />
      </>,
    );
    expect(screen.getByLabelText("Nume")).toHaveAttribute("aria-describedby", "name-hint name-error");
    expect(describedBy("x", false)).toBeUndefined();
    expect(describedBy(undefined, true)).toBeUndefined();
  });

  it("forwards a ref to the native element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input id="n" aria-label="Nume" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});

describe("Select and Textarea", () => {
  it("render native elements with the same error wiring", () => {
    render(
      <>
        <Label htmlFor="size">Dimensiunea saltelei</Label>
        <Select id="size" invalid>
          <option value="">Încă nu știu</option>
          <option value="160x200">160 × 200 cm</option>
        </Select>
        <Label htmlFor="msg">Ce pat îți dorești?</Label>
        <Textarea id="msg" rows={4} />
      </>,
    );
    const select = screen.getByLabelText("Dimensiunea saltelei");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAttribute("aria-describedby", "size-error");
    expect(select.className).toContain("min-h-12");

    const textarea = screen.getByLabelText("Ce pat îți dorești?");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveAttribute("rows", "4");
    expect(textarea.className).toContain("resize-y");
    expect(textarea.className).toContain("py-3");
    expect(textarea).not.toHaveAttribute("aria-invalid");
  });
});

describe("FileInput", () => {
  it("is a dashed file input that passes accept and multiple through", () => {
    render(
      <>
        <Label htmlFor="photos">Poze cu camera sau cu un pat care îți place (opțional)</Label>
        <FileInput id="photos" accept="image/*" multiple />
      </>,
    );
    const input = screen.getByLabelText("Poze cu camera sau cu un pat care îți place (opțional)");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).toHaveAttribute("multiple");
    expect(input.className).toContain("border-dashed");
    expect(input.className).toContain("p-3");
  });
});

describe("Checkbox", () => {
  it("is a real checkbox input inside a flex label", () => {
    render(
      <Checkbox id="consent" name="consent" required>
        Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.
      </Checkbox>,
    );
    const box = screen.getByRole("checkbox", {
      name: "Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.",
    });
    expect(box.tagName).toBe("INPUT");
    expect(box).toHaveAttribute("type", "checkbox");
    expect(box).toBeRequired();
    expect(box.className).toContain("size-5");
    expect(box.className).toContain("accent-accent");

    const label = box.closest("label");
    expect(label).not.toBeNull();
    expect(label).toHaveAttribute("for", "consent");
    expect(label!.className).toContain("flex");
    expect(label!.className).toContain("gap-3");
    expect(label!.className).toContain("min-h-11");
  });

  it("links its error when invalid", () => {
    render(
      <>
        <Checkbox id="consent" invalid>
          Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.
        </Checkbox>
        <FieldError fieldId="consent">Bifează acordul ca să trimiți cererea.</FieldError>
      </>,
    );
    const box = screen.getByRole("checkbox");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("Bifează acordul ca să trimiți cererea.");
  });
});

describe("FieldError", () => {
  it("renders nothing without a message", () => {
    const { container } = render(<FieldError fieldId="email">{undefined}</FieldError>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FormCard", () => {
  it("renders the bar texts above the content", () => {
    render(
      <FormCard bar={{ left: "Cerere de ofertă", right: "Răspuns în [24h]" }} data-testid="card">
        <p>Câmpuri</p>
      </FormCard>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("border-[1.5px]");
    expect(card.className).toContain("border-ink");
    expect(card.className).toContain("bg-white");
    expect(card.className).toContain("gap-[18px]");

    const left = screen.getByText("Cerere de ofertă");
    const right = screen.getByText("Răspuns în [24h]");
    const bar = left.parentElement!;
    expect(bar).toBe(right.parentElement);
    expect(bar.className).toContain("border-b");
    expect(bar.className).toContain("border-rule");
    expect(bar.className).toContain("eyebrow");
    expect(bar.compareDocumentPosition(screen.getByText("Câmpuri")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no bar when none is given", () => {
    render(
      <FormCard data-testid="card">
        <p>Câmpuri</p>
      </FormCard>,
    );
    expect(screen.getByTestId("card").querySelector(".eyebrow")).toBeNull();
  });
});
