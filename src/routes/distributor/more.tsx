import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Megaphone, MessageSquareWarning, User } from "lucide-react";
import { DistributorShell } from "@/components/distributor-shell";

export const Route = createFileRoute("/distributor/more")({
  component: MorePage,
});

const links = [
  {
    to: "/distributor/complaints",
    label: "Complaints",
    icon: MessageSquareWarning,
    desc: "View dealer complaints",
  },
  {
    to: "/distributor/campaigns",
    label: "Campaigns",
    icon: Megaphone,
    desc: "Active & upcoming offers",
  },
  {
    to: "/distributor/notifications",
    label: "Notifications",
    icon: Bell,
    desc: "Order alerts & reminders",
  },
  { to: "/distributor/profile", label: "Profile", icon: User, desc: "Account & demo role switch" },
] as const;

function MorePage() {
  return (
    <DistributorShell title="More">
      <div className="space-y-2">
        {links.map(({ to, label, icon: Icon, desc }) => (
          <Link
            key={to}
            to={to}
            className="press flex items-center gap-4 rounded-3xl border border-border bg-card p-4 shadow-soft"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary">
              <Icon className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{label}</p>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </DistributorShell>
  );
}
