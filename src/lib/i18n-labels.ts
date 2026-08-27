import { useTranslation } from "react-i18next";
import type { CampaignStatus, ComplaintStatus, OrderStatus } from "@/lib/mock/distributor/types";

const ORDER_STATUS_KEYS: Record<OrderStatus, string> = {
  order_placed: "orderStatus.orderPlaced",
  approved: "orderStatus.approved",
  in_making: "orderStatus.inMaking",
  out_for_delivery: "orderStatus.outForDelivery",
  delivered: "orderStatus.delivered",
  rejected: "orderStatus.rejected",
  cancelled: "orderStatus.cancelled",
};

const COMPLAINT_STATUS_KEYS: Record<ComplaintStatus, string> = {
  pending: "complaintStatus.pending",
  in_progress: "complaintStatus.inProgress",
  resolved: "complaintStatus.resolved",
  rejected: "complaintStatus.rejected",
};

const CAMPAIGN_STATUS_KEYS: Record<CampaignStatus, string> = {
  active: "campaignStatus.active",
  upcoming: "campaignStatus.upcoming",
  expired: "campaignStatus.expired",
};

export function orderStatusKey(status: OrderStatus) {
  return ORDER_STATUS_KEYS[status];
}

export function complaintStatusKey(status: ComplaintStatus) {
  return COMPLAINT_STATUS_KEYS[status];
}

export function campaignStatusKey(status: CampaignStatus) {
  return CAMPAIGN_STATUS_KEYS[status];
}

export function useOrderStatusLabel(status: OrderStatus) {
  const { t } = useTranslation();
  return t(ORDER_STATUS_KEYS[status]);
}

export function useComplaintStatusLabel(status: ComplaintStatus) {
  const { t } = useTranslation();
  return t(COMPLAINT_STATUS_KEYS[status]);
}

export function useCampaignStatusLabel(status: CampaignStatus) {
  const { t } = useTranslation();
  return t(CAMPAIGN_STATUS_KEYS[status]);
}

export function useVisitStatusLabel(status: "active" | "completed") {
  const { t } = useTranslation();
  return t(`visitStatus.${status}`);
}

/** Map timeline event status to order status label when possible. */
export function useTimelineEventLabel(event: { label: string; status?: string }) {
  const { t } = useTranslation();
  const status = event.status as OrderStatus | undefined;
  if (status && status in ORDER_STATUS_KEYS) {
    return t(ORDER_STATUS_KEYS[status as OrderStatus]);
  }
  const normalized = event.label.toLowerCase();
  if (normalized.includes("placed")) return t("orderStatus.orderPlaced");
  if (normalized.includes("approved")) return t("orderStatus.approved");
  if (normalized.includes("making")) return t("orderStatus.inMaking");
  if (normalized.includes("delivery")) return t("orderStatus.outForDelivery");
  if (normalized.includes("delivered")) return t("orderStatus.delivered");
  if (normalized.includes("cancelled")) return t("orderStatus.cancelled");
  if (normalized.includes("rejected")) return t("orderStatus.rejected");
  return event.label;
}
