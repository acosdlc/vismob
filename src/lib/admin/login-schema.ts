import { z } from "zod";
import { parseLeadForm, type ParseResult } from "@/lib/validation/schemas";
import { ADMIN_MESSAGES } from "./types";

// The /admin/login form (docs/PLAN.md PR-7): what the `signIn` Server Action
// accepts. Every message is an ADMIN_MESSAGES entry. The email is trimmed and
// lowercased before the format check (`z.email()` is a format schema, so it runs
// through a pipe); the password is taken as typed, only its presence is checked.

export const loginSchema = z.object({
  email: z
    .string({ error: ADMIN_MESSAGES.required })
    .trim()
    .min(1, ADMIN_MESSAGES.required)
    .toLowerCase()
    .max(254, ADMIN_MESSAGES.email)
    .pipe(z.email({ error: ADMIN_MESSAGES.email })),
  password: z.string({ error: ADMIN_MESSAGES.required }).min(1, ADMIN_MESSAGES.required).max(256, ADMIN_MESSAGES.tooLong),
});

export type LoginInput = z.output<typeof loginSchema>;

/** Validates the posted login form; on failure, the first message per field (the shape of parseLeadForm). */
export function parseLogin(formData: FormData): ParseResult<LoginInput> {
  return parseLeadForm(formData, loginSchema);
}
