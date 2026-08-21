import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, LogOut } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/states";
import { requirePendingUser } from "@/lib/auth-guard";
import { useSession } from "@/hooks/use-session";
import { logout } from "@/services/auth";

export const Route = createFileRoute("/pending-approval")({
  beforeLoad: () => requirePendingUser(),
  head: () => ({
    meta: [{ title: "Awaiting Approval — BackRest" }],
  }),
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const { user, loading } = useSession();

  async function handleLogout() {
    await logout();
    window.location.href = "/";
  }

  if (loading) return <PageSkeleton rows={3} />;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-10 pt-8 md:max-w-[520px]">
        <Logo size="sm" />

        <div className="mt-12 animate-rise text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-secondary">
            <Clock className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mt-6 font-display text-2xl font-bold">Request Sent for Approval</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Hi {user?.name?.split(" ")[0] ?? "there"}, your account is awaiting approval from a BackRest
            administrator. You&apos;ll get access once your role and assignments are confirmed.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Registered phone: <span className="font-semibold text-foreground">{user?.phone ?? "—"}</span>
          </p>
        </div>

        <div className="mt-auto space-y-3 pt-10">
          <Button
            variant="outline"
            className="h-12 w-full rounded-2xl"
            onClick={() => void handleLogout()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Need help? Contact your distributor or BackRest support.
          </p>
          <Link to="/" className="block text-center text-sm font-semibold text-primary">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
