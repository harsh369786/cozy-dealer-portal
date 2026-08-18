import type { CampaignStatus, ComplaintStatus, OrderStatus } from "@/lib/mock/distributor/types";
import { cn } from "@/lib/utils";

const orderStyles: Record<OrderStatus, string> = {
  pending_approval: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
  in_production: "bg-blue-100 text-blue-900",
  delivered: "bg-secondary text-secondary-foreground",
};

const orderLabels: Record<OrderStatus, string> = {
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  in_production: "In Production",
  delivered: "Delivered",
};

const complaintStyles: Record<ComplaintStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  in_progress: "bg-blue-100 text-blue-900",
  resolved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
};

const complaintLabels: Record<ComplaintStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

const campaignStyles: Record<CampaignStatus, string> = {
  active: "bg-emerald-100 text-emerald-900",
  upcoming: "bg-blue-100 text-blue-900",
  expired: "bg-muted text-muted-foreground",
};

const campaignLabels: Record<CampaignStatus, string> = {
  active: "Active",
  upcoming: "Upcoming",
  expired: "Expired",
};

type StatusBadgeProps =
  | { kind: "order"; status: OrderStatus }
  | { kind: "complaint"; status: ComplaintStatus }
  | { kind: "campaign"; status: CampaignStatus };

export function StatusBadge(props: StatusBadgeProps) {
  let label: string;
  let style: string;
  if (props.kind === "order") {
    label = orderLabels[props.status];
    style = orderStyles[props.status];
  } else if (props.kind === "complaint") {
    label = complaintLabels[props.status];
    style = complaintStyles[props.status];
  } else {
    label = campaignLabels[props.status];
    style = campaignStyles[props.status];
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        style,
      )}
    >
      {label}
    </span>
  );
}
