import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, MapPin, Phone, Store } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireRoles } from "@/lib/auth-guard";
import { useSession } from "@/hooks/use-session";
import { useAsyncData } from "@/hooks/use-async-data";
import { getDealerById } from "@/services/dealers";
import { logout } from "@/services/auth";
import { getRewardBalance } from "@/services/rewards";
import { PageSkeleton } from "@/components/shared/states";

export const Route = createFileRoute("/profile")({
  beforeLoad: () => requireRoles(["dealer"]),
  component: DealerProfilePage,
});

function DealerProfilePage() {
  const { user } = useSession();
  const navigate = useNavigate();

  const { data: dealer, loading: dealerLoading } = useAsyncData(
    () => (user?.dealerId ? getDealerById(user.dealerId) : Promise.resolve(null)),
    [user?.dealerId],
  );

  const { data: balance, loading: balanceLoading } = useAsyncData(() => getRewardBalance(), []);

  const loading = dealerLoading || balanceLoading;

  return (
    <AppShell title="My Profile" back="/campaigns">
      {loading && <PageSkeleton rows={2} />}

      {!loading && (
        <div className="animate-rise space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <p className="font-display text-xl font-bold">{user?.name ?? "Dealer"}</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" />
              {user?.phone}
            </p>
            <Badge className="mt-3 capitalize">Dealer</Badge>
            {balance && (
              <p className="mt-3 text-sm font-bold text-primary">
                {balance.balance.toLocaleString("en-IN")} reward points
              </p>
            )}
          </div>

          {dealer && (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <p className="flex items-center gap-2 font-display font-bold">
                <Store className="h-5 w-5 text-primary" />
                {dealer.name}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Code: {dealer.code}</p>
              <p className="mt-2 flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{dealer.address ?? dealer.location}</span>
              </p>
              {dealer.gstNumber && (
                <p className="mt-2 text-sm text-muted-foreground">GST: {dealer.gstNumber}</p>
              )}
            </div>
          )}

          <Button
            variant="outline"
            className="h-12 w-full rounded-2xl"
            onClick={async () => {
              await logout();
              navigate({ to: "/" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      )}
    </AppShell>
  );
}
