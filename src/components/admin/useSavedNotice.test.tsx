import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { startTransition, useActionState, type FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { useSavedNotice } from "./useSavedNotice";

type Action = (prev: AdminActionState, formData: FormData) => Promise<AdminActionState>;

const SAVED: AdminActionState = { status: "ok", message: ADMIN_MESSAGES.saved };

function setup() {
  return renderHook(({ pending }: { pending: boolean }) => useSavedNotice(pending), { initialProps: { pending: false } });
}

describe("useSavedNotice", () => {
  it("starts unedited and is marked by an edit", () => {
    const { result } = setup();
    expect(result.current[0]).toBe(false);

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    // A second edit changes nothing.
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
  });

  it("is cleared when a submit is sent, and stays clear when its answer arrives", () => {
    const { result, rerender } = setup();
    act(() => result.current[1]());

    // The submit carries what the form holds now: nothing is unsaved while it runs.
    rerender({ pending: true });
    expect(result.current[0]).toBe(false);
    rerender({ pending: false });
    expect(result.current[0]).toBe(false);

    // Saved again with no edit in between: still nothing to hide.
    rerender({ pending: true });
    rerender({ pending: false });
    expect(result.current[0]).toBe(false);
  });

  it("keeps an edit made while the submit is on its way: the answer does not speak for it", () => {
    const { result, rerender } = setup();

    rerender({ pending: true });
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    rerender({ pending: false });
    expect(result.current[0]).toBe(true);

    // The next submit carries it.
    rerender({ pending: true });
    expect(result.current[0]).toBe(false);
  });

  it("hands back the same marker on every render", () => {
    const { result, rerender } = setup();
    const markEdited = result.current[1];

    act(() => markEdited());
    rerender({ pending: true });
    rerender({ pending: false });

    expect(result.current[1]).toBe(markEdited);
  });
});

// The admin forms in small: `useActionState` drives the action, the submit goes through
// `onSubmit`, the input is uncontrolled and the form's `onChange` marks the edit. The
// hook is fed React's own `pending`, as in the forms, not a prop the test flips.
function Harness({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, ADMIN_INITIAL_STATE);
  const [edited, markEdited] = useSavedNotice(pending);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={onSubmit} onChange={markEdited}>
      <label htmlFor="name">Nume</label>
      <input id="name" name="name" defaultValue="Catifea" />
      <button type="submit" disabled={pending}>
        Salvează
      </button>
      {!pending && state.status === "ok" && !edited && <p role="status">{state.message}</p>}
    </form>
  );
}

/** An action the test answers by hand, so it can stand between a submit and its answer. */
function heldAction() {
  const waiting: Array<(state: AdminActionState) => void> = [];
  const action = vi.fn<Action>(() => new Promise((resolve) => waiting.push(resolve)));
  return { action, answer: (state: AdminActionState) => waiting.shift()?.(state) };
}

describe("useSavedNotice in a form driven by useActionState", () => {
  it("hides the notice on an edit, shows it after the next save and after a save with no edit in between", async () => {
    const { action, answer } = heldAction();
    render(<Harness action={action} />);
    const name = screen.getByLabelText("Nume");
    const submit = screen.getByRole("button", { name: "Salvează" });

    // An edit before any save: there is no notice to hide, and the first save still shows it.
    fireEvent.change(name, { target: { value: "Catifea fină" } });
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    answer(SAVED);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);

    fireEvent.change(name, { target: { value: "Catifea groasă" } });
    expect(screen.queryByRole("status")).toBeNull();
    expect(name).toHaveValue("Catifea groasă");

    fireEvent.click(submit);
    answer(SAVED);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(action.mock.calls[1][1].get("name")).toBe("Catifea groasă");

    // No edit in between: the notice goes while the save runs and comes back with its answer.
    fireEvent.click(submit);
    expect(screen.queryByRole("status")).toBeNull();
    answer(SAVED);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
  });

  it("hides the notice at the first keystroke: a browser sends `input` while typing, `change` only on leaving the field", async () => {
    const { action, answer } = heldAction();
    render(<Harness action={action} />);
    const name = screen.getByLabelText("Nume");

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    answer(SAVED);
    await screen.findByRole("status");

    fireEvent.input(name, { target: { value: "Catifea f" } });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the notice away when the answer arrives after an edit made while the save was on its way", async () => {
    const { action, answer } = heldAction();
    render(<Harness action={action} />);
    const name = screen.getByLabelText("Nume");
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    // The submit left with „Catifea”; this is typed before its answer.
    fireEvent.change(name, { target: { value: "Catifea fină" } });
    answer(SAVED);
    await waitFor(() => expect(submit).toBeEnabled());

    expect(action.mock.calls[0][1].get("name")).toBe("Catifea");
    expect(name).toHaveValue("Catifea fină");
    expect(screen.queryByRole("status")).toBeNull();

    // The next save carries it, and the notice is back.
    fireEvent.click(submit);
    answer(SAVED);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(action.mock.calls[1][1].get("name")).toBe("Catifea fină");
  });
});
