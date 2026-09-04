// Remembers a deep-link target (from a notification tap) when the user lands logged-out, so the
// login flow can replay it after a successful sign-in. Used by:
//   - src/lib/auth-guard.ts (requireUser) — stores the intended path before bouncing to "/"
//   - src/routes/index.tsx (login) — consumes it after verifyOtp / demoLogin succeeds
// sessionStorage (not localStorage) so it never leaks across tabs/sessions or lingers.

const KEY = "backrest_pending_notification_target";

/**
 * Store an intended in-app path to replay after login. Only accepts same-origin app paths that
 * start with "/" and are NOT the login page itself, to avoid redirect loops or open-redirects.
 */
export function storePendingNotificationTarget(path: string): void {
  if (typeof window === "undefined") return;
  if (typeof path !== "string") return;
  // Must be a root-relative path (no scheme/host) and not the login page.
  if (!path.startsWith("/") || path.startsWith("//")) return;
  if (path === "/") return;
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // sessionStorage can throw (private mode / quota) — ignore, deep-link replay is best-effort.
  }
}

/**
 * Read and clear the stored target. Returns null when there is none or it is invalid.
 */
export function consumePendingNotificationTarget(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value) window.sessionStorage.removeItem(KEY);
    if (!value || !value.startsWith("/") || value.startsWith("//") || value === "/") {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
