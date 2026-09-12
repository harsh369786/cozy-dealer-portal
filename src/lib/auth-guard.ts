import { redirect } from "@tanstack/react-router";
import type { UserRole } from "@/lib/mock/distributor/types";
import type { SessionUser } from "@/lib/mock/distributor/types";
import { getCurrentUser, getHomePath, getPostLoginPath, peekCachedUser } from "@/services/auth";
import { storePendingNotificationTarget } from "@/lib/pending-notification-target";

// When a logged-out user opens a deep link (e.g. tapping a push notification while signed out),
// remember where they were headed so the login page can send them there after sign-in. Only runs
// client-side, and the helper ignores "/" and non-app paths.
function rememberDeepLinkBeforeLogin() {
  if (typeof window === "undefined") return;
  storePendingNotificationTarget(
    window.location.pathname + window.location.search + window.location.hash,
  );
}

function deferOnSsr(): SessionUser | null {
  if (import.meta.env.SSR) return null;
  return null;
}

export async function requireUser() {
  if (import.meta.env.SSR) return deferOnSsr() as SessionUser;

  // COLD-LAUNCH SAFE PATH: trust the synchronously-available cached/stored user and render
  // immediately, revalidating in the BACKGROUND. On an installed Android PWA, blocking on the
  // network /auth/me here is exactly what caused the spurious auto-logout: right after reopening,
  // the session cookie may not be attached to the first request yet, so a blocking getCurrentUser()
  // could resolve null and bounce a perfectly-logged-in user to "/". By trusting peekCachedUser()
  // (memory cache or localStorage) and kicking revalidation off without awaiting it, a transient
  // cold-launch 401 can never log the user out — getCurrentUser only clears local state on a
  // CONFIRMED logout (see fetchCurrentUser), which will then redirect on the NEXT navigation.
  const cached = peekCachedUser();
  if (cached) {
    // Fire-and-forget revalidation (refreshes the cache + re-plants cookies via the rolling
    // /auth/me refresh). Never awaited, so it can't block or bounce this cold launch.
    void getCurrentUser();
    if (cached.status === "pending_approval") throw redirect({ to: "/pending-approval" });
    if (cached.status === "rejected" || cached.status === "suspended") throw redirect({ to: "/" });
    return cached;
  }

  // No cached/stored user at all — this IS a genuinely signed-out visitor (or localStorage was
  // evicted). Fall back to the network check; getCurrentUser only returns null on a confirmed
  // logout, so this won't fire on a transient blip when a session actually exists.
  const user = await getCurrentUser();
  if (!user) {
    rememberDeepLinkBeforeLogin();
    throw redirect({ to: "/" });
  }
  if (user.status === "pending_approval") throw redirect({ to: "/pending-approval" });
  if (user.status === "rejected" || user.status === "suspended") throw redirect({ to: "/" });
  return user;
}

export async function requirePendingUser() {
  if (import.meta.env.SSR) return deferOnSsr() as SessionUser;
  const user = await getCurrentUser();
  if (!user) throw redirect({ to: "/" });
  if (user.status !== "pending_approval") {
    throw redirect({ to: getPostLoginPath(user) });
  }
  return user;
}

export async function requireRoles(roles: UserRole[]) {
  const user = await requireUser();
  if (import.meta.env.SSR) return user;
  if (!roles.includes(user.role)) {
    throw redirect({ to: getHomePath(user.role) });
  }
  return user;
}
