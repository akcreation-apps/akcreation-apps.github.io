// KS Panda — single source of truth for verification / special-purpose
// accounts and sites that must never be edited, disabled, or deleted
// through the normal admin UI. Google (and other review flows) run
// automated checks against these accounts, so a human mistake that
// removes them breaks external verification.
//
// To change the verification target, edit ONLY this file and reload the
// admin pages. No other file hard-codes the name or email.

/** Exact site name that identifies the Google verification site.
 *  Case-sensitive. Must match the `name` field on the Firestore
 *  attn_sites document. */
export const VERIFICATION_SITE_NAME = "Google Verify Site";

/** Exact email of the Google verification employee account.
 *  Case-insensitive match is applied by `isVerificationUser`. */
export const VERIFICATION_EMAIL = "google-verify@kspanda.com";

/** Returns true if the given site doc (either raw data or { data() })
 *  is the verification site. Safe on null / undefined. */
export function isVerificationSite(site) {
  if (!site) return false;
  const name = typeof site.data === "function" ? site.data()?.name : site.name;
  return (name ?? "").trim() === VERIFICATION_SITE_NAME;
}

/** Returns true if the given user doc is the verification employee.
 *  Compares the normalized email so any case / whitespace variation
 *  still matches. */
export function isVerificationUser(user) {
  if (!user) return false;
  const email = (typeof user.data === "function" ? user.data()?.email : user.email) ?? "";
  return email.trim().toLowerCase() === VERIFICATION_EMAIL.toLowerCase();
}
