import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { SessionUser, UserRole } from "@/lib/mock/distributor/types";
import * as auth from "@/services/auth";

type SessionSnapshot = {
  user: SessionUser | null;
  loading: boolean;
  ready: boolean;
};

let snapshot: SessionSnapshot = {
  user: auth.peekCachedUser(),
  loading: !auth.hasFreshSessionCache(),
  ready: auth.hasFreshSessionCache(),
};
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setSnapshot(next: SessionSnapshot) {
  snapshot = next;
  emit();
}

async function loadSession(force = false) {
  if (force) auth.invalidateSessionCache();

  if (!force && auth.hasFreshSessionCache()) {
    setSnapshot({ user: auth.peekCachedUser(), loading: false, ready: true });
    return;
  }

  if (loadPromise) return loadPromise;

  setSnapshot({ ...snapshot, loading: true, ready: false });
  loadPromise = auth
    .getCurrentUser()
    .then((user) => {
      setSnapshot({ user, loading: false, ready: true });
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

auth.registerSessionInvalidateHandler(() => {
  setSnapshot({ user: null, loading: false, ready: true });
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function useSession() {
  const { user, loading, ready } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void loadSession(false);
  }, []);

  const refresh = useCallback(async () => {
    await loadSession(true);
  }, []);

  const role: UserRole | null = !ready || loading ? null : (user?.role ?? null);

  return {
    user,
    role,
    loading: loading || !ready,
    isPendingApproval: user?.status === "pending_approval",
    isDistributor: role === "distributor" || role === "sales_executive",
    isAdmin: role === "master_admin" || role === "admin_staff",
    refresh,
  };
}
