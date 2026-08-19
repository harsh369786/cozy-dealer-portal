import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/complaints/")({
  beforeLoad: () => {
    throw redirect({ to: "/orders" });
  },
});
