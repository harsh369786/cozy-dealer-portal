import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getRole } from "@/services/auth";

export const Route = createFileRoute("/distributor")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && getRole() !== "distributor") {
      throw redirect({ to: "/home" });
    }
  },
  component: () => <Outlet />,
});
