/** Pocket logins use a username. Supabase Auth needs an email, so each username maps to a
 *  private, non-deliverable address. Older email logins (with "@") still work as typed. */
export const USERNAME_DOMAIN = "pocket.bino.local";
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export const normalizeUsername = (u: string) => u.trim().toLowerCase();

export function loginEmail(input: string): string {
  const v = normalizeUsername(input);
  return v.includes("@") ? v : `${v}@${USERNAME_DOMAIN}`;
}

/** What to show for an account: the username for Pocket accounts, the email for older ones. */
export function displayLogin(email: string | null | undefined): string {
  const e = (email ?? "").toLowerCase();
  return e.endsWith(`@${USERNAME_DOMAIN}`) ? e.slice(0, -USERNAME_DOMAIN.length - 1) : e;
}
