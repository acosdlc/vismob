"use server";

import { mintFormToken } from "@/lib/security/form-token";

/**
 * The pages are static, so the form asks for its signed "started at" token on
 * first interaction and posts it back as `startedAt` (ARHITECTURA §6.1 step 3.1).
 * Returns "" when the token cannot be minted (missing FORM_HMAC_SECRET); the
 * submit then fails closed with the form's generic message.
 */
export async function issueFormToken(): Promise<string> {
  try {
    return mintFormToken();
  } catch (error) {
    console.error("issueFormToken", error);
    return "";
  }
}
