import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { notFound, redirect, unstable_isUnrecognizedActionError } from "next/navigation";
import { Component, startTransition, type FormEvent, type ReactNode } from "react";
import { hydrateRoot, type ReactFormState, type Root } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { useGuardedActionState } from "./useGuardedActionState";

type Action = (prev: AdminActionState, formData: FormData) => Promise<AdminActionState>;

const SAVED: AdminActionState = { status: "ok", message: ADMIN_MESSAGES.saved };
// What the admin forms pass as `failed`: a text for a call that brought no answer.
const FAILED: AdminActionState = { status: "error", message: ADMIN_MESSAGES.noAnswer };

// The forms in small: the hook drives the action, the form element carries `formAction`,
// the submit goes through `onSubmit` to `submit`, and the input is uncontrolled.
function Harness({ action }: { action: Action }) {
  const [state, formAction, pending, submit] = useGuardedActionState(action, ADMIN_INITIAL_STATE, FAILED);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }

  return (
    <form action={formAction} onSubmit={onSubmit}>
      <label htmlFor="name">Nume</label>
      <input id="name" name="name" defaultValue="Catifea" />
      <button type="submit" disabled={pending}>
        Salvează
      </button>
      {!pending && state.status !== "idle" && <p role={state.status === "ok" ? "status" : "alert"}>{state.message}</p>}
    </form>
  );
}

/** Stands where the framework's boundaries are; React reports what it catches to `onCaughtError`. */
class Boundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  state = { caught: false };

  static getDerivedStateFromError() {
    return { caught: true };
  }

  render() {
    return this.state.caught ? null : this.props.children;
  }
}

/** What `redirect()` and `notFound()` throw: a Server Action that calls one rejects with it in the browser. */
function thrownBy(control: () => never): unknown {
  try {
    return control();
  } catch (error) {
    return error;
  }
}

/** An action the test answers by hand, so it can stand between a submit and its answer. */
function heldAction() {
  const waiting: Array<(state: AdminActionState) => void> = [];
  const action = vi.fn<Action>(() => new Promise((resolve) => waiting.push(resolve)));
  return { action, answer: (state: AdminActionState) => waiting.shift()?.(state) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGuardedActionState", () => {
  it("answers as useActionState does: pending while the call is on its way, then the action's state", async () => {
    const { action, answer } = heldAction();
    render(<Harness action={action} />);
    const submit = screen.getByRole("button", { name: "Salvează" });
    fireEvent.change(screen.getByLabelText("Nume"), { target: { value: "Catifea fină" } });

    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][0]).toBe(ADMIN_INITIAL_STATE);
    expect(action.mock.calls[0][1].get("name")).toBe("Catifea fină");

    answer(SAVED);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(submit).toBeEnabled();

    // The next call gets the state the form shows, as the action's `prev`.
    fireEvent.click(submit);
    answer({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(action.mock.calls[1][0]).toBe(SAVED);
  });

  // The causes that pass: the mock fails once and then answers, as the server would.
  it.each<[string, unknown]>([
    ["a dropped connection", new TypeError("Failed to fetch")],
    ["an answer that is not the action's", new Error("An unexpected response was received from the server.")],
    ["a rejection that is not an Error", "offline"],
  ])("turns %s into the failed state, with the form and what was typed still there", async (_name, rejection) => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const action = vi.fn<Action>().mockRejectedValueOnce(rejection).mockResolvedValue(SAVED);
    const caught = vi.fn();
    render(
      <Boundary>
        <Harness action={action} />
      </Boundary>,
      { onCaughtError: caught },
    );
    const name = screen.getByLabelText("Nume");
    fireEvent.change(name, { target: { value: "Catifea fină" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.noAnswer);
    expect(caught).not.toHaveBeenCalled();
    // The reason is not on screen, so it is left on the console.
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith("useGuardedActionState", rejection);
    // The same input, not a new one with the same value: the form was never taken down.
    expect(screen.getByLabelText("Nume")).toBe(name);
    expect(name).toHaveValue("Catifea fină");
    const submit = screen.getByRole("button", { name: "Salvează" });
    expect(submit).toBeEnabled();

    // The failed call did not break the form: the next one goes through, with the typed text.
    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[1][0]).toBe(FAILED);
    expect(action.mock.calls[1][1].get("name")).toBe("Catifea fină");
    expect(reported).toHaveBeenCalledTimes(1);
  });

  it("answers an action the server no longer knows, after a deployment, with the failed state on every try", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // What Next.js throws in the browser when the server answers that it does not know the
    // action's id (server-action-reducer.js); next/navigation exports only the check for it.
    // The id is compiled into the script the page loaded, so the server answers every later
    // call from that page the same way: this mock rejects every call.
    const retired = new UnrecognizedActionError(
      'Server Action "40c1" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
    );
    expect(unstable_isUnrecognizedActionError(retired)).toBe(true);
    const action = vi.fn<Action>().mockRejectedValue(retired);
    const caught = vi.fn();
    render(
      <Boundary>
        <Harness action={action} />
      </Boundary>,
      { onCaughtError: caught },
    );
    const name = screen.getByLabelText("Nume");
    fireEvent.change(name, { target: { value: "Catifea fină" } });
    const submit = screen.getByRole("button", { name: "Salvează" });

    for (let attempt = 1; attempt <= 2; attempt++) {
      fireEvent.click(submit);

      // One report per call the guard caught: the notice below answers this try, not the one before.
      await waitFor(() => expect(reported).toHaveBeenCalledTimes(attempt));
      expect(reported).toHaveBeenLastCalledWith("useGuardedActionState", retired);
      const notice = await screen.findByRole("alert");
      expect(notice).toHaveTextContent(ADMIN_MESSAGES.noAnswer);
      // No retry from this page can work, so the notice itself has to name the way out: a reload.
      expect(notice).toHaveTextContent(/reîncarcă pagina/);
      expect(caught).not.toHaveBeenCalled();
      // The same input, with its text: neither try took the form down.
      expect(screen.getByLabelText("Nume")).toBe(name);
      expect(name).toHaveValue("Catifea fină");
      expect(submit).toBeEnabled();
    }
    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[1][0]).toBe(FAILED);
    expect(action.mock.calls[1][1].get("name")).toBe("Catifea fină");
  });

  it.each<[string, unknown]>([
    ["the redirect after a create", thrownBy(() => redirect("/admin/recenzii/7?creat=1"))],
    ["a not-found", thrownBy(() => notFound())],
  ])("lets %s through to the framework instead of calling it a failure", async (_name, control) => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const action = vi.fn<Action>().mockRejectedValue(control);
    const caught = vi.fn();
    render(
      <Boundary>
        <Harness action={action} />
      </Boundary>,
      { onCaughtError: caught },
    );

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(caught).toHaveBeenCalledTimes(1));
    // The very error, untouched: the framework reads its digest.
    expect(caught.mock.calls[0][0]).toBe(control);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(ADMIN_MESSAGES.noAnswer)).toBeNull();
    expect(reported).not.toHaveBeenCalled();
  });
});

// Without JavaScript the browser posts the form itself. React renders the fields for that
// post only on a form bound to a Server Action: the server asks the action's reference for
// them (`$$FORM_ACTION`, after binding the previous state) and puts a `javascript:` address
// on a form bound to anything else. After the post, the framework hands the action's answer
// to the render (`formState`) and the matching `useActionState` starts from it.
describe("useGuardedActionState on the server, for a submit without JavaScript", () => {
  const REFERENCE_FIELD = "$ACTION_ID_test";

  /** A stand-in for the reference a Client Component gets when it imports a Server Action. */
  function serverReference(run: Action = async () => SAVED): Action {
    const fields = () => {
      const data = new FormData();
      data.append(REFERENCE_FIELD, "");
      return { name: undefined, action: undefined, encType: "multipart/form-data", method: "POST", target: undefined, data };
    };
    const reference: Action = (prev, formData) => run(prev, formData);
    return Object.assign(reference, {
      $$FORM_ACTION: fields,
      $$IS_SIGNATURE_EQUAL: () => true,
      bind: () => Object.assign(() => undefined, { $$FORM_ACTION: fields }),
    });
  }

  async function serverHtml(action: Action, formState?: ReactFormState): Promise<string> {
    const stream = await renderToReadableStream(<Harness action={action} />, { formState });
    await stream.allReady;
    return new Response(stream).text();
  }

  function parse(html: string): Document {
    return new DOMParser().parseFromString(html, "text/html");
  }

  /** What the framework hands the render after such a post: the action's answer under the key the form posted. */
  async function answeredWith(action: Action, answer: AdminActionState): Promise<ReactFormState> {
    const key = parse(await serverHtml(action)).querySelector<HTMLInputElement>('input[name="$ACTION_KEY"]')!.value;
    return [answer, key, "test", 0] as unknown as ReactFormState;
  }

  it("renders the form bound to the action itself, not to the guard around it", async () => {
    const page = parse(await serverHtml(serverReference()));
    const form = page.querySelector("form")!;

    expect(form.querySelector(`input[type="hidden"][name="${CSS.escape(REFERENCE_FIELD)}"]`)).not.toBeNull();
    expect(form.getAttribute("method")).toBe("POST");
    expect(form.getAttribute("action") ?? "").not.toContain("javascript:");
    expect(page.querySelector("[role]")).toBeNull();

    // A form bound to a plain function is what React refuses to post.
    const plain = parse(await serverHtml(async () => SAVED));
    expect(plain.querySelector("form")!.getAttribute("action")).toContain("javascript:");
  });

  it("shows the state the action answered such a submit with", async () => {
    const action = serverReference();

    const answered = parse(await serverHtml(action, await answeredWith(action, SAVED)));

    expect(answered.querySelector('[role="status"]')?.textContent).toBe(ADMIN_MESSAGES.saved);
  });

  it("keeps that state when the script arrives after all, and the next submit is a guarded call from it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn<Action>().mockRejectedValue(new TypeError("Failed to fetch"));
    const action = serverReference(run);
    const formState = await answeredWith(action, SAVED);
    const container = document.body.appendChild(document.createElement("div"));
    container.innerHTML = await serverHtml(action, formState);
    const served = container.querySelector('[role="status"]');
    expect(served).not.toBeNull();

    const mismatch = vi.fn();
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Harness action={action} />, { formState, onRecoverableError: mismatch });
    });
    try {
      // React attached to the server's markup: a mismatch would have made it render the form anew, idle.
      expect(mismatch).not.toHaveBeenCalled();
      expect(container.querySelector('[role="status"]')).toBe(served);

      fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.noAnswer);
      expect(run.mock.calls[0][0]).toBe(SAVED);
    } finally {
      act(() => root?.unmount());
      container.remove();
    }
  });
});
