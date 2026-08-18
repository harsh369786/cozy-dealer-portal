import type { SessionUser, UserRole } from "@/lib/mock/distributor/types";
import { DISTRIBUTOR_ID, distributors } from "@/lib/mock/distributor/data";

const ROLE_KEY = "backrest-role";
const SESSION_KEY = "backrest-session";

const DEFAULT_USER: SessionUser = {
  id: "user-001",
  name: "Rajesh Sharma",
  phone: "+91 98765 43210",
  role: "dealer",
};

function readRole(): UserRole {
  if (typeof window === "undefined") return "dealer";
  const stored = sessionStorage.getItem(ROLE_KEY) as UserRole | null;
  return stored ?? "dealer";
}

function readSession(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function getRole(): UserRole {
  return readRole();
}

export function getCurrentUser(): SessionUser | null {
  return readSession();
}

export function isLoggedIn(): boolean {
  return readSession() !== null;
}

export async function login(phone: string): Promise<SessionUser> {
  await delay();
  const role = readRole();
  const dist = distributors[DISTRIBUTOR_ID];
  const user: SessionUser =
    role === "distributor"
      ? {
          id: DISTRIBUTOR_ID,
          name: dist!.name,
          phone: dist!.phone,
          role: "distributor",
          distributorId: DISTRIBUTOR_ID,
        }
      : { ...DEFAULT_USER, phone: `+91 ${phone}` };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export function switchRoleDemo(role: UserRole): void {
  sessionStorage.setItem(ROLE_KEY, role);
  const existing = readSession();
  const dist = distributors[DISTRIBUTOR_ID];
  const updated: SessionUser =
    role === "distributor"
      ? {
          id: DISTRIBUTOR_ID,
          name: dist!.name,
          phone: dist!.phone,
          role: "distributor",
          distributorId: DISTRIBUTOR_ID,
        }
      : existing
        ? { ...DEFAULT_USER, phone: existing.phone }
        : { ...DEFAULT_USER };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(updated));
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getHomePath(role?: UserRole): string {
  const r = role ?? readRole();
  return r === "distributor" ? "/distributor/dashboard" : "/home";
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms));
}
