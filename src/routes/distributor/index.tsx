import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/distributor/")({
  beforeLoad: () => {
    throw redirect({ to: "/distributor/dashboard" });
  },
});
