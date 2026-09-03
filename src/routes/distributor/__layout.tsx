import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireRoles } from "@/lib/auth-guard";

export const Route = createFileRoute("/distributor/__layout")({
  // Use the async, network-backed role guard (not the synchronous getRole(), which reads
  // only the cache/localStorage and can bounce a valid user to /home during a cold-load
  // hydration when that mirror is empty). Also allow sales_executive, who legitimately use
  // the /distributor/* section.
  beforeLoad: () => requireRoles(["distributor", "sales_executive"]),
  component: () => <Outlet />,
});
