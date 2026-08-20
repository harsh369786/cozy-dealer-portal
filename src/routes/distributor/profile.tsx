import { createFileRoute } from "@tanstack/react-router";
import { DistributorShell } from "@/components/distributor-shell";
import { useSession } from "@/hooks/use-session";
import { DISTRIBUTOR_ID, distributors } from "@/lib/mock/distributor/data";
import { Badge } from "@/components/ui/badge";
import { logout } from "@/services/auth";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/distributor/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, role } = useSession();
  const dist = distributors[DISTRIBUTOR_ID];
  const navigate = useNavigate();

  return (
    <DistributorShell title="Profile" back="/distributor/more" showBell={false}>
      <div className="animate-rise space-y-5">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <p className="font-display text-xl font-bold">{user?.name ?? dist?.name}</p>
          <p className="text-sm text-muted-foreground">{user?.phone ?? dist?.phone}</p>
          <Badge className="mt-3 capitalize">{role}</Badge>
          <p className="mt-2 text-sm text-muted-foreground">Region: {dist?.region}</p>
        </div>

        <Button
          variant="outline"
          className="w-full rounded-2xl"
          onClick={async () => {
            await logout();
            navigate({ to: "/" });
          }}
        >
          Sign out
        </Button>
      </div>
    </DistributorShell>
  );
}
