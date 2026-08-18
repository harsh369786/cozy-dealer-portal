import { createFileRoute } from "@tanstack/react-router";
import { DistributorShell } from "@/components/distributor-shell";
import { useSession } from "@/hooks/use-session";
import { DISTRIBUTOR_ID, distributors } from "@/lib/mock/distributor/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/distributor/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, role, switchRole } = useSession();
  const dist = distributors[DISTRIBUTOR_ID];

  return (
    <DistributorShell title="Profile" back="/distributor/more" showBell={false}>
      <div className="animate-rise space-y-5">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <p className="font-display text-xl font-bold">{user?.name ?? dist?.name}</p>
          <p className="text-sm text-muted-foreground">{user?.phone ?? dist?.phone}</p>
          <Badge className="mt-3 capitalize">{role}</Badge>
          <p className="mt-2 text-sm text-muted-foreground">Region: {dist?.region}</p>
        </div>

        <div className="rounded-3xl border border-dashed border-primary/40 bg-secondary/40 p-5">
          <p className="font-display font-bold">Switch role (demo)</p>
          <p className="mt-2 text-sm text-muted-foreground">
            In production, your role is assigned by admin. Use this toggle to preview the dealer
            experience during development.
          </p>
          <Button
            className="mt-4 w-full rounded-2xl"
            variant="outline"
            onClick={() => switchRole("dealer")}
          >
            Switch to Dealer view
          </Button>
        </div>
      </div>
    </DistributorShell>
  );
}
