import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageSkeleton } from "@/components/shared/states";
import { requireRoles } from "@/lib/auth-guard";
import { cn } from "@/lib/utils";
import { getComplaintById } from "@/services/complaints";
import type { ComplaintStatus } from "@/lib/mock/distributor/types";
import { getOrderById } from "@/services/orders";
import { useAsyncData } from "@/hooks/use-async-data";

export const Route = createFileRoute("/complaints/$complaintId")({
  beforeLoad: () => requireRoles(["dealer"]),
  component: TrackComplaint,
});

const COMPLAINT_STEPS: ComplaintStatus[] = ["pending", "in_progress", "resolved"];

function TrackComplaint() {
  const { t } = useTranslation();
  const { complaintId } = Route.useParams();
  const { data: complaint, loading, error } = useAsyncData(
    () => getComplaintById(complaintId),
    [complaintId],
  );
  const { data: order } = useAsyncData(
    () => (complaint?.orderId ? getOrderById(complaint.orderId) : Promise.resolve(null)),
    [complaint?.orderId],
  );

  if (loading) {
    return (
      <AppShell title={t("dealer.complaints.trackTitle")} back="/complaints">
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  if (error || !complaint) {
    return (
      <AppShell title={t("dealer.complaints.title")} back="/complaints">
        <p className="text-muted-foreground">{t("dealer.complaints.notFound")}</p>
        <Link to="/complaints" className="mt-4 block text-sm font-bold text-primary">
          {t("dealer.complaints.backToAll")}
        </Link>
      </AppShell>
    );
  }

  const status = complaint.status as ComplaintStatus;
  const steps: ComplaintStatus[] =
    status === "rejected" ? ["pending", "rejected"] : COMPLAINT_STEPS;
  const currentIdx = Math.max(0, steps.indexOf(status));
  const history = complaint.history ?? [];

  return (
    <AppShell title={t("dealer.complaints.trackTitle")} back="/complaints">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-lg font-bold">{complaint.complaintNumber ?? complaint.id}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dealer.complaints.orderLabel", { orderId: complaint.orderId })}
            </p>
          </div>
          <StatusBadge kind="complaint" status={status} />
        </div>
        <p className="mt-4 text-sm">{complaint.description}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("dealer.complaints.submitted", { date: complaint.createdAt })}
        </p>
        {complaint.resolutionNotes ? (
          <p className="mt-3 rounded-2xl bg-secondary px-4 py-3 text-sm">{complaint.resolutionNotes}</p>
        ) : null}
        {order?.items?.[0] ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {order.items[0].model} · {order.items[0].size} × {order.items[0].thickness}
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-sm font-bold">{t("dealer.complaints.status")}</p>
      {history.length > 0 ? (
        <ol className="mt-3">
          {history.map((event, idx) => (
            <li key={`${event.at}-${idx}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-transparent brand-gradient text-xs font-bold text-primary-foreground">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                {idx < history.length - 1 && <span className="w-0.5 flex-1 bg-primary" />}
              </div>
              <div className="pb-5">
                <p className="text-base font-bold">{event.label}</p>
                <p className="text-xs text-muted-foreground">{event.at}</p>
                {event.note ? <p className="mt-1 text-sm text-muted-foreground">{event.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="mt-3">
          {steps.map((step, idx) => {
            const done = idx <= currentIdx;
            return (
              <li key={step} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-full border-2 text-xs font-bold",
                      done && "border-transparent brand-gradient text-primary-foreground",
                      !done && "border-border text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-4 w-4" strokeWidth={3} /> : ""}
                  </span>
                  {idx < steps.length - 1 && (
                    <span className={cn("w-0.5 flex-1", done ? "bg-primary" : "bg-border")} />
                  )}
                </div>
                <span className={cn("pb-5 text-base", done ? "font-bold" : "text-muted-foreground")}>
                  {t(`dealer.complaints.steps.${step}`)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {complaint.orderId && (
        <Link
          to="/orders/$orderId"
          params={{ orderId: complaint.orderId }}
          className="press mt-2 block rounded-2xl border border-border bg-secondary py-3 text-center text-sm font-bold"
        >
          {t("dealer.complaints.viewOrder")}
        </Link>
      )}
    </AppShell>
  );
}
