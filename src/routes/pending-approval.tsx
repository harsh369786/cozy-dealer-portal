import { createFileRoute, Link } from "@tanstack/react-router";

import { Clock, LogOut } from "lucide-react";

import { useTranslation } from "react-i18next";

import { Logo } from "@/components/brand";

import { LanguageSwitcher } from "@/components/shared/language-switcher";

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

  const { t } = useTranslation();

  const { user, loading } = useSession();



  async function handleLogout() {

    await logout();

    window.location.href = "/";

  }



  if (loading) return <PageSkeleton rows={3} />;



  return (

    <div className="relative min-h-screen overflow-x-hidden bg-background">

      <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-10 pt-8 md:max-w-[520px]">

        <div className="flex items-center justify-between gap-3">

          <Logo size="sm" />

          <LanguageSwitcher compact />

        </div>



        <div className="mt-12 animate-rise text-center">

          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-secondary">

            <Clock className="h-10 w-10 text-primary" />

          </div>

          <h1 className="mt-6 font-display text-2xl font-bold">{t("auth.requestSentForApproval")}</h1>

          <p className="mt-3 text-base text-muted-foreground">

            {t("auth.pendingApprovalBody", { name: user?.name?.split(" ")[0] ?? "there" })}

          </p>

          <p className="mt-4 text-sm text-muted-foreground">

            {t("auth.registeredPhone")}{" "}

            <span className="font-semibold text-foreground">{user?.phone ?? "—"}</span>

          </p>

        </div>



        <div className="mt-auto space-y-3 pt-10">

          <Button

            variant="outline"

            className="h-12 w-full rounded-2xl"

            onClick={() => void handleLogout()}

          >

            <LogOut className="mr-2 h-4 w-4" />

            {t("common.signOut")}

          </Button>

          <p className="text-center text-xs text-muted-foreground">{t("auth.needHelpContact")}</p>

          <Link to="/" className="block text-center text-sm font-semibold text-primary">

            {t("common.backToLogin")}

          </Link>

        </div>

      </div>

    </div>

  );

}

