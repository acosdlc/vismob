import { useCallback, useState } from "react";

/**
 * Whether an admin form was edited since its last submit was sent, for the „Salvat.” notice
 * beside „Salvează”. Nothing else on a screen tells the admin what is saved (there is no
 * warning on leaving it), so the notice may only speak for what that submit carried: the
 * forms hide it while `edited` is true and show it again after the next successful save.
 * Error notices and field errors do not look at the flag; they stay until the next submit.
 *
 * The inputs are uncontrolled, so there is no state to compare: the form reports an edit as
 * it happens. `markEdited` goes on the `<form>`'s `onChange` (React's change bubbles there
 * from every input, textarea, select, checkbox and file input) and on PhotoField's
 * `onRemove`, which is a click.
 *
 * `pending` is the third value of the form's `useActionState`. The flag is cleared when a
 * submit is sent, not when its answer arrives: what is typed while a save is on its way was
 * not in that submit, so its „Salvat.” must not cover it. A submit the form holds back (a
 * photo still uploading) is never sent and clears nothing.
 */
export function useSavedNotice(pending: boolean): readonly [edited: boolean, markEdited: () => void] {
  const [edited, setEdited] = useState(false);
  // Derived while rendering, as React documents for state that follows a changed value
  // (ProjectPhotosForm counts its saves the same way).
  const [wasPending, setWasPending] = useState(pending);
  if (pending !== wasPending) {
    setWasPending(pending);
    if (pending) setEdited(false);
  }
  const markEdited = useCallback(() => setEdited(true), []);
  return [edited, markEdited];
}
