import type { CampaignStatus, ComplaintStatus, OrderStatus } from "@/lib/mock/distributor/types";
import {
  useCampaignStatusLabel,
  useComplaintStatusLabel,
  useOrderStatusLabel,
  useVisitStatusLabel,
} from "@/lib/i18n-labels";
import { cn } from "@/lib/utils";

const orderStyles: Record<OrderStatus, string> = {
  order_placed: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
  cancelled: "bg-red-100 text-red-900",
  in_making: "bg-blue-100 text-blue-900",
  out_for_delivery: "bg-violet-100 text-violet-900",
  delivered: "bg-secondary text-secondary-foreground",
};

const complaintStyles: Record<ComplaintStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  in_progress: "bg-blue-100 text-blue-900",
  resolved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
};

const campaignStyles: Record<CampaignStatus, string> = {
  active: "bg-emerald-100 text-emerald-900",
  upcoming: "bg-blue-100 text-blue-900",
  expired: "bg-muted text-muted-foreground",
};

type StatusBadgeProps =
  | { kind: "order"; status: OrderStatus }
  | { kind: "complaint"; status: ComplaintStatus }
  | { kind: "campaign"; status: CampaignStatus }
  | { kind: "visit"; status: "active" | "completed" };

const visitStyles = {
  active: "bg-amber-100 text-amber-900",
  completed: "bg-emerald-100 text-emerald-900",
} as const;

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const label = useOrderStatusLabel(status);
  return <StatusBadgeInner label={label} style={orderStyles[status]} />;
}

function ComplaintStatusBadge({ status }: { status: ComplaintStatus }) {
  const label = useComplaintStatusLabel(status);
  return <StatusBadgeInner label={label} style={complaintStyles[status]} />;
}

function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const label = useCampaignStatusLabel(status);
  return <StatusBadgeInner label={label} style={campaignStyles[status]} />;
}

function VisitStatusBadge({ status }: { status: "active" | "completed" }) {
  const label = useVisitStatusLabel(status);
  return <StatusBadgeInner label={label} style={visitStyles[status]} />;
}

function StatusBadgeInner({ label, style }: { label: string; style: string }) {
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

export function StatusBadge(props: StatusBadgeProps) {
  if (props.kind === "order") return <OrderStatusBadge status={props.status} />;
  if (props.kind === "complaint") return <ComplaintStatusBadge status={props.status} />;
  if (props.kind === "visit") return <VisitStatusBadge status={props.status} />;
  return <CampaignStatusBadge status={props.status} />;
}
