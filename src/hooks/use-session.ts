import { useCallback, useEffect, useState } from "react";
import type { SessionUser, UserRole } from "@/lib/mock/distributor/types";
import * as auth from "@/services/auth";

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    auth.invalidateSessionCache();
    const current = await auth.getCurrentUser();
    setUser(current);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const role: UserRole = user?.role ?? "dealer";

  return {
    user,
    role,
    loading,
    isDistributor: role === "distributor",
    isAdmin: role === "master_admin" || role === "admin_staff",
    refresh,
  };
}
