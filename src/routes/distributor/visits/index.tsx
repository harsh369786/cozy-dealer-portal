import { createFileRoute, Link } from "@tanstack/react-router";

import { useMemo, useState } from "react";

import { useTranslation } from "react-i18next";

import { Clock, History, MapPin, Plus, Search, Store } from "lucide-react";

import { toast } from "sonner";

import { DistributorShell } from "@/components/distributor-shell";

import { StatusBadge } from "@/components/shared/status-badge";

import { ErrorState, PageSkeleton } from "@/components/shared/states";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";

import { useAsyncData } from "@/hooks/use-async-data";

import { captureLocation } from "@/hooks/use-geolocation";

import { useFormat } from "@/hooks/use-format";

import { useFormatApiError } from "@/lib/api-errors";
import type { DistributorDealer } from "@/lib/mock/distributor/types";
import { cn } from "@/lib/utils";
import { getDealers } from "@/services/dealers";

import {

  checkInVisit,

  checkOutVisit,

  getActiveVisit,

  type DealerVisit,

} from "@/services/visits";



export const Route = createFileRoute("/distributor/visits/")({

  component: VisitsPage,

});



function formatDuration(minutes: number | undefined) {

  if (minutes == null) return "—";

  if (minutes < 60) return `${minutes} min`;

  const h = Math.floor(minutes / 60);

  const m = minutes % 60;

  return m > 0 ? `${h}h ${m}m` : `${h}h`;

}



function VisitSummary({ visit }: { visit: DealerVisit }) {

  const { t } = useTranslation();

  const { formatTimestamp } = useFormat();



  return (

    <div className="animate-rise space-y-4 rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-soft">

      <div className="flex items-start justify-between gap-2">

        <div>

          <p className="text-sm font-semibold text-emerald-800">{t("distributor.visits.visitCompleted")}</p>

          <p className="font-display text-xl font-bold">{visit.dealerName}</p>

          <p className="text-sm text-muted-foreground">{visit.storeName}</p>

        </div>

        <StatusBadge kind="visit" status="completed" />

      </div>

      <dl className="grid gap-2 text-sm">

        <div className="flex justify-between gap-2">

          <dt className="text-muted-foreground">{t("distributor.visits.checkInLabel")}</dt>

          <dd className="font-semibold">{formatTimestamp(visit.checkInAt)}</dd>

        </div>

        <div className="flex justify-between gap-2">

          <dt className="text-muted-foreground">{t("distributor.visits.checkOutLabel")}</dt>

          <dd className="font-semibold">

            {visit.checkOutAt ? formatTimestamp(visit.checkOutAt) : "—"}

          </dd>

        </div>

        <div className="flex justify-between gap-2">

          <dt className="text-muted-foreground">{t("distributor.visits.durationLabel")}</dt>

          <dd className="font-semibold">{formatDuration(visit.durationMinutes)}</dd>

        </div>

      </dl>

      {visit.notes && (

        <div className="rounded-2xl bg-card p-3">

          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">

            {t("distributor.visits.discussion")}

          </p>

          <p className="mt-1 whitespace-pre-wrap text-sm">{visit.notes}</p>

        </div>

      )}

      <Link to="/distributor/visits/history">

        <Button variant="outline" className="w-full rounded-2xl font-bold">

          {t("distributor.visits.viewVisitHistory")}

        </Button>

      </Link>

    </div>

  );

}



function ActiveVisitCard({

  visit,

  onCompleted,

}: {

  visit: DealerVisit;

  onCompleted: (v: DealerVisit) => void;

}) {

  const { t } = useTranslation();

  const { formatTimestamp } = useFormat();

  const formatApiError = useFormatApiError();

  const [notes, setNotes] = useState("");

  const [checkingOut, setCheckingOut] = useState(false);

  const [locationMsg, setLocationMsg] = useState<string | null>(null);



  const handleCheckout = async () => {

    if (notes.trim().length < 5) {

      toast.error(t("errors.visitNotesMin5"));

      return;

    }

    setCheckingOut(true);

    setLocationMsg(null);

    try {

      const loc = await captureLocation();

      setLocationMsg(

        loc ? t("distributor.visits.currentLocationCaptured") : t("distributor.visits.locationUnavailable"),

      );

      const updated = await checkOutVisit(visit.id, {

        notes: notes.trim(),

        lat: loc?.lat,

        lng: loc?.lng,

      });

      toast.success(t("distributor.visits.visitCheckedOut"));

      onCompleted(updated);

    } catch (e) {

      toast.error(formatApiError(e, "errors.checkOutFailed"));

    } finally {

      setCheckingOut(false);

    }

  };



  return (

    <div className="space-y-4 rounded-3xl border-2 border-primary/30 bg-card p-5 shadow-soft">

      <div className="flex items-start justify-between gap-2">

        <div>

          <p className="text-xs font-bold uppercase tracking-wide text-primary">

            {t("distributor.visits.activeVisit")}

          </p>

          <p className="font-display text-xl font-bold">{visit.dealerName}</p>

          <p className="text-sm text-muted-foreground">{visit.storeName}</p>

        </div>

        <StatusBadge kind="visit" status="active" />

      </div>



      <dl className="space-y-2 text-sm">

        <div>

          <dt className="text-muted-foreground">{t("common.address")}</dt>

          <dd className="font-medium">{visit.address}</dd>

        </div>

        <div className="flex justify-between gap-2">

          <div>

            <dt className="text-muted-foreground">{t("common.mobile")}</dt>

            <dd className="font-medium">{visit.mobile}</dd>

          </div>

          <div className="text-right">

            <dt className="text-muted-foreground">{t("distributor.visits.checkedInLabel")}</dt>

            <dd className="font-medium">{formatTimestamp(visit.checkInAt)}</dd>

          </div>

        </div>

        {visit.checkInLat != null && visit.checkInLng != null && (

          <p className="text-xs text-muted-foreground">{t("distributor.visits.checkInLocationRecorded")}</p>

        )}

      </dl>



      <div className="space-y-2">

        <Label htmlFor="visit-notes" className="font-bold">

          {t("distributor.visits.visitNotesLabel")} <span className="text-destructive">*</span>

        </Label>

        <Textarea

          id="visit-notes"

          value={notes}

          onChange={(e) => setNotes(e.target.value)}

          placeholder={t("common.visitNotesPlaceholder")}

          rows={4}

          className="rounded-2xl"

        />

      </div>



      {locationMsg && <p className="text-sm text-muted-foreground">{locationMsg}</p>}



      <Button

        className="press h-12 w-full rounded-2xl text-base font-bold"

        onClick={handleCheckout}

        disabled={checkingOut}

      >

        {checkingOut ? t("common.checkingOut") : t("common.checkout")}

      </Button>

    </div>

  );

}



function CheckInForm({ onCheckedIn }: { onCheckedIn: (v: DealerVisit) => void }) {
  const { t } = useTranslation();
  const formatApiError = useFormatApiError();
  const [search, setSearch] = useState("");
  const [selectedDealer, setSelectedDealer] = useState<DistributorDealer | null>(null);
  const [newStoreMode, setNewStoreMode] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState("");
  const [mobile, setMobile] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);

  const { data: dealers, loading: dealersLoading } = useAsyncData(
    () => getDealers(false, { active: "active", sort: "name" }),
    [],
  );

  const filteredDealers = useMemo(() => {
    const list = dealers ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list.slice(0, 8);
    return list
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          d.location.toLowerCase().includes(q) ||
          (d.address ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [dealers, search]);

  const selectDealer = (dealer: DistributorDealer) => {
    setSelectedDealer(dealer);
    setNewStoreMode(false);
    setSearch(dealer.name);
    setStoreName(dealer.name);
    setAddress(dealer.address ?? dealer.location ?? "");
    setMobile(dealer.phone);
  };

  const startNewStore = () => {
    setSelectedDealer(null);
    setNewStoreMode(true);
    setStoreName(search.trim());
    setAddress("");
    setMobile("");
  };

  const canCheckIn = newStoreMode
    ? storeName.trim().length >= 2 && address.trim().length >= 5 && mobile.replace(/\D/g, "").length >= 10
    : Boolean(selectedDealer);

  const handleCheckIn = async () => {
    if (!canCheckIn) {
      toast.error(t("distributor.visits.selectStoreFirst"));
      return;
    }
    setSubmitting(true);
    setLocationMsg(null);
    try {
      const loc = await captureLocation();
      setLocationMsg(
        loc ? t("distributor.visits.currentLocationCaptured") : t("distributor.visits.locationUnavailable"),
      );
      const visit = await checkInVisit(
        selectedDealer && !newStoreMode
          ? { dealerId: selectedDealer.id, lat: loc?.lat, lng: loc?.lng }
          : {
              storeName: storeName.trim(),
              address: address.trim(),
              mobile: mobile.trim(),
              lat: loc?.lat,
              lng: loc?.lng,
            },
      );
      toast.success(t("distributor.visits.checkedInSuccess"));
      onCheckedIn(visit);
    } catch (e) {
      toast.error(formatApiError(e, "errors.checkInFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div>
        <h2 className="font-display text-lg font-bold">{t("distributor.visits.newDealerVisit")}</h2>
        <p className="text-sm text-muted-foreground">{t("distributor.visits.selectStoreDesc")}</p>
      </div>

      {!newStoreMode && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedDealer(null);
              }}
              placeholder={t("distributor.visits.searchStorePlaceholder")}
              className="h-11 rounded-xl pl-9"
            />
          </div>

          {dealersLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

          {!dealersLoading && search.trim() && !selectedDealer && (
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {filteredDealers.map((dealer) => (
                <li key={dealer.id}>
                  <button
                    type="button"
                    onClick={() => selectDealer(dealer)}
                    className="press w-full rounded-2xl border border-border bg-background p-3 text-left"
                  >
                    <p className="font-bold">{dealer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {dealer.code} · {dealer.location}
                    </p>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={startNewStore}
                  className="press flex w-full items-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-secondary/40 p-3 text-left text-sm font-bold text-primary"
                >
                  <Plus className="h-4 w-4" />
                  {t("distributor.visits.addNewStore")}
                </button>
              </li>
            </ul>
          )}

          {selectedDealer && (
            <div className="rounded-2xl border border-primary/30 bg-secondary/40 p-4">
              <div className="flex items-start gap-3">
                <Store className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{selectedDealer.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedDealer.code}</p>
                </div>
                <button
                  type="button"
                  className="text-xs font-bold text-primary"
                  onClick={() => {
                    setSelectedDealer(null);
                    setSearch("");
                    setStoreName("");
                    setAddress("");
                    setMobile("");
                  }}
                >
                  {t("common.change")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(newStoreMode || selectedDealer) && (
        <div className="space-y-3 border-t border-border pt-4">
          {newStoreMode && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{t("distributor.visits.newStoreEntry")}</p>
                <button
                  type="button"
                  className="text-xs font-bold text-primary"
                  onClick={() => {
                    setNewStoreMode(false);
                    setStoreName("");
                    setAddress("");
                    setMobile("");
                  }}
                >
                  {t("distributor.visits.backToSearch")}
                </button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-name">
                  {t("common.storeName")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="store-name"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder={t("common.shopNamePlaceholder")}
                  className="h-11 rounded-xl"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="address">
              {t("common.address")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              readOnly={Boolean(selectedDealer && !newStoreMode)}
              placeholder={t("common.fullAddressPlaceholder")}
              className={cn("h-11 rounded-xl", selectedDealer && !newStoreMode && "bg-secondary/50")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mobile">
              {t("common.mobileNumber")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mobile"
              type="tel"
              inputMode="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              readOnly={Boolean(selectedDealer && !newStoreMode)}
              placeholder={t("common.phonePlaceholder")}
              className={cn("h-11 rounded-xl", selectedDealer && !newStoreMode && "bg-secondary/50")}
            />
          </div>
        </div>
      )}

      {locationMsg && <p className="text-sm text-muted-foreground">{locationMsg}</p>}

      <Button
        className="press h-14 w-full rounded-2xl text-base font-bold"
        onClick={handleCheckIn}
        disabled={submitting || !canCheckIn}
      >
        <MapPin className="mr-2 h-5 w-5" />
        {submitting ? t("common.checkingIn") : t("common.checkIn")}
      </Button>
    </div>
  );
}

function VisitsPage() {

  const { t } = useTranslation();

  const [completedVisit, setCompletedVisit] = useState<DealerVisit | null>(null);

  const [activeVisit, setActiveVisit] = useState<DealerVisit | null>(null);

  const [loaded, setLoaded] = useState(false);



  const { loading, error, retry } = useAsyncData(async () => {

    const visit = await getActiveVisit();

    setActiveVisit(visit);

    setLoaded(true);

    return visit;

  }, []);



  if (loading && !loaded) {

    return (

      <DistributorShell title={t("distributor.visits.title")}>

        <PageSkeleton rows={4} />

      </DistributorShell>

    );

  }



  if (error) {

    return (

      <DistributorShell title={t("distributor.visits.title")}>

        <ErrorState message={error} onRetry={retry} />

      </DistributorShell>

    );

  }



  return (

    <DistributorShell title={t("distributor.visits.title")}>

      <div className="mb-4 flex items-center justify-between gap-2">

        <p className="text-sm text-muted-foreground">{t("distributor.visits.selectStoreDesc")}</p>

        <Link

          to="/distributor/visits/history"

          className="press flex items-center gap-1 rounded-full bg-secondary px-3 py-2 text-sm font-bold text-primary"

        >

          <History className="h-4 w-4" />

          {t("distributor.visits.visitHistory")}

        </Link>

      </div>



      {completedVisit ? (

        <VisitSummary visit={completedVisit} />

      ) : activeVisit ? (

        <ActiveVisitCard

          visit={activeVisit}

          onCompleted={(v) => {

            setActiveVisit(null);

            setCompletedVisit(v);

          }}

        />

      ) : (

        <CheckInForm

          onCheckedIn={(v) => {

            setCompletedVisit(null);

            setActiveVisit(v);

          }}

        />

      )}



      {!activeVisit && !completedVisit && (

        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-secondary/60 p-4 text-sm text-muted-foreground">

          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

          <p>{t("distributor.visits.noVisitsDesc")}</p>

        </div>

      )}

    </DistributorShell>

  );

}


