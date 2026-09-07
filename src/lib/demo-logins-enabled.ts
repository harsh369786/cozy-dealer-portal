import { api } from "@/lib/api-client";

/** True when demo login shortcuts should render based on the CLIENT BUILD (local dev / VITE flag). */
export function isDemoLoginsEnabledByBuild(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_DEMO_LOGINS === "1" ||
    import.meta.env.VITE_DEMO_LOGINS === "true"
  );
}

/**
 * Ask the SERVER whether demo logins are enabled (MOCK_OTP / DEMO_LOGINS_ENABLED on the worker).
 * This lets the demo buttons appear on any deployed environment that actually accepts demo logins,
 * independent of the build-time flag above. Returns false on any error so buttons stay hidden if
 * the server can't be reached or demo mode is off.
 */
export async function fetchDemoLoginsEnabledFromServer(): Promise<boolean> {
  try {
    const res = await api.get<{ demoLoginsEnabled: boolean }>("/api/v1/config/public");
    return Boolean(res.demoLoginsEnabled);
  } catch {
    return false;
  }
}
