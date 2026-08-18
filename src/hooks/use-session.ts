import { useCallback, useEffect, useState } from "react";
import type { SessionUser, UserRole } from "@/lib/mock/distributor/types";
import * as auth from "@/services/auth";

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<UserRole>("dealer");

  const refresh = useCallback(() => {
    setUser(auth.getCurrentUser());
    setRole(auth.getRole());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const switchRole = useCallback((next: UserRole) => {
    auth.switchRoleDemo(next);
    window.location.href = auth.getHomePath(next);
  }, []);

  return { user, role, isDistributor: role === "distributor", switchRole, refresh };
}
