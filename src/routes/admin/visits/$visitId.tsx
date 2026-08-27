import { useTranslation } from "react-i18next";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, MapPin } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import { mapsUrl } from "@/hooks/use-geolocation";
import { formatDisplayDateTime } from "@/lib/date-format";
import { getAdminVisit } from "@/services/admin/visits";

export const Route = createFileRoute("/admin/visits/$visitId")({
  component: AdminVisitDetailPage,
});

function formatDuration(minutes?: number) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} hour${h > 1 ? "s" : ""} ${m} min` : `${h} hour${h > 1 ? "s" : ""}`;
}

function LocationLink({
  label,
  lat,
  lng,
}: {
  label: string;
  lat?: number;
  lng?: number;
}) {
  const url = mapsUrl(lat, lng);
  if (!url) {
    return (
      <p className="text-sm text-muted-foreground">
        {label}: Location unavailable
      </p>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-primary"
    >
      <MapPin className="h-4 w-4" />
      View {label} location
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function AdminVisitDetailPage() {
  const { t } = useTranslation();
  const { visitId } = Route.useParams();

  const { data: visit, loading, error, retry } = useAsyncData(
    () => getAdminVisit(visitId),
    [visitId],
  );

  if (loading) return <PageSkeleton rows={3} />;
  if (error || !visit) {
    return <ErrorState message={error ?? t("errors.notFound")} onRetry={retry} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={visit.dealerName}
        description={`${visit.storeName} · ${visit.salesExecutiveName ?? "Sales executive"}`}
        actions={
          <Link to="/admin/visits">
            <Button variant="outline" className="rounded-2xl font-bold">
              ← Back
            </Button>
          </Link>
        }
      />

      <div className="flex items-center gap-3">
        <StatusBadge kind="visit" status={visit.status} />
        <span className="text-sm text-muted-foreground">Visit {visit.id}</span>
      </div>

      <AdminSection title="Dealer details">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Detail label="Store name" value={visit.storeName} />
          <Detail label="Mobile" value={visit.mobile} />
          <Detail label="Address" value={visit.address} className="sm:col-span-2" />
          <Detail label="Sales executive" value={visit.salesExecutiveName ?? "—"} />
        </dl>
      </AdminSection>

      <AdminSection title="Visit timeline">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Detail label="Check-in" value={formatDisplayDateTime(visit.checkInAt)} />
          <Detail
            label="Check-out"
            value={visit.checkOutAt ? formatDisplayDateTime(visit.checkOutAt) : "—"}
          />
          <Detail label="Duration" value={formatDuration(visit.durationMinutes)} />
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <LocationLink label="check-in" lat={visit.checkInLat} lng={visit.checkInLng} />
          {visit.status === "completed" && (
            <LocationLink label="check-out" lat={visit.checkOutLat} lng={visit.checkOutLng} />
          )}
        </div>
      </AdminSection>

      {visit.notes && (
        <AdminSection title="Discussion / notes">
          <p className="whitespace-pre-wrap rounded-2xl bg-secondary/50 p-4 text-sm">{visit.notes}</p>
        </AdminSection>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
