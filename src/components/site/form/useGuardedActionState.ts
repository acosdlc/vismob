import { unstable_rethrow } from "next/navigation";
import { useActionState, useCallback } from "react";

/**
 * `useActionState` for a form that submits through `onSubmit` (the admin forms, ContactForm,
 * QuoteForm), with one difference: when the call to the Server Action fails, the form gets
 * `failed` as its state instead of being replaced by an error screen.
 *
 * A call fails, with no state for the form, when the connection drops, when a laptop wakes
 * from sleep with a dead socket, when the server answers with something that is not the
 * action's result, when the action throws, or when a deployment made while the form was
 * open retired the action's id. The call then rejects, React rethrows a rejected
 * `useActionState` action while rendering, and the nearest error boundary takes the form
 * down with everything typed in it. Caught here, the form stays mounted (its inputs are
 * uncontrolled, so the text is still in them) and shows its own error; the next submit is
 * a new call.
 *
 * `redirect()` and `notFound()` in an action reach the browser as rejections too. Those are
 * the framework's control flow, not failures: that is how a create lands on the new
 * record's screen. `unstable_rethrow` passes them on untouched, as the Next.js docs ask of
 * any `catch` that may see them.
 *
 * Returns what `useActionState` returns, plus `submit`:
 * - `formAction` goes on the `<form action>` and nowhere else. It comes from a
 *   `useActionState` over the Server Action itself: React renders the hidden fields that
 *   let a browser post the form without JavaScript only for such a form, never for one
 *   bound to a function of ours. That post has no script to fail in; the server answers it
 *   with a whole page.
 * - `submit` is what `onSubmit` calls, inside `startTransition`, with the form's data: the
 *   guarded call.
 * - `state` and `pending` follow `submit`. `state` starts from the answer to a post without
 *   JavaScript when the page was rendered for one, else from `initialState`.
 *
 * Pass a module constant as `failed`: the guard is then created once per form.
 */
export function useGuardedActionState<State>(
  action: (prev: Awaited<State>, formData: FormData) => Promise<State>,
  initialState: Awaited<State>,
  failed: Awaited<State>,
): readonly [state: Awaited<State>, formAction: (formData: FormData) => void, pending: boolean, submit: (formData: FormData) => void] {
  const [posted, formAction] = useActionState(action, initialState);

  const guarded = useCallback(
    async (prev: Awaited<State>, formData: FormData): Promise<Awaited<State>> => {
      try {
        return await action(prev, formData);
      } catch (error) {
        unstable_rethrow(error);
        // The form says only that the call failed. The reason goes to the console, where
        // it also ended up while the error still reached a boundary.
        console.error("useGuardedActionState", error);
        return failed;
      }
    },
    [action, failed],
  );
  const [state, submit, pending] = useActionState(guarded, posted);

  return [state, formAction, pending, submit];
}
