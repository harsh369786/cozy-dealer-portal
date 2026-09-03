import { Outlet, createFileRoute } from "@tanstack/react-router";
import { requireRoles } from "@/lib/auth-guard";

export const Route = createFileRoute("/campaigns")({
  beforeLoad: () => requireRoles(["dealer"]),
  component: () => <Outlet />,
});
