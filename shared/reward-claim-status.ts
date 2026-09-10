// Reward Claim workflow — the SINGLE source of truth for the claim lifecycle, shared by the API and
// the client. This is deliberately SEPARATE from the order status machine (OrderStatus).
//
// Flow: Dealer claims -> Distributor approves/rejects -> Admin Staff processes
//       (approved -> processing -> dispatched_from_factory) -> Distributor marks delivered.

export const REWARD_CLAIM_STATUSES = [
  "pending_approval", // Claimed by dealer; awaiting distributor approval
  "approved", // Distributor approved; goes to admin staff
  "processing", // Admin staff processing
  "dispatched_from_factory", // Admin staff dispatched from factory
  "delivered", // Distributor delivered to dealer
  "rejected", // Distributor rejected (rejection_reason mandatory)
  "cancelled", // Cancelled
] as const;

export type RewardClaimStatus = (typeof REWARD_CLAIM_STATUSES)[number];

/** i18n key per status (rewardClaimStatus.<key>). */
export const REWARD_CLAIM_STATUS_I18N: Record<RewardClaimStatus, string> = {
  pending_approval: "rewardClaimStatus.pendingApproval",
  approved: "rewardClaimStatus.approved",
  processing: "rewardClaimStatus.processing",
  dispatched_from_factory: "rewardClaimStatus.dispatchedFromFactory",
  delivered: "rewardClaimStatus.delivered",
  rejected: "rewardClaimStatus.rejected",
  cancelled: "rewardClaimStatus.cancelled",
};

/** English fallback labels (non-React modules / server). */
export const REWARD_CLAIM_STATUS_LABELS: Record<RewardClaimStatus, string> = {
  pending_approval: "Pending Approval",
  approved: "Approved",
  processing: "Processing",
  dispatched_from_factory: "Dispatched from Factory",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Which roles may perform a given transition. Everything else is forbidden. */
type WorkflowRole =
  | "master_admin"
  | "admin_staff"
  | "distributor"
  | "sales_executive"
  | "sales_head"
  | "dealer";

type Transition = {
  from: RewardClaimStatus;
  to: RewardClaimStatus;
  /** Roles allowed to perform this transition. */
  roles: WorkflowRole[];
  /** When true, a non-empty reason is REQUIRED (distributor rejection). */
  requiresReason?: boolean;
};

// master_admin can do everything a distributor or admin_staff can, so it's included on each row.
export const REWARD_CLAIM_TRANSITIONS: Transition[] = [
  // Distributor approves or rejects a newly-claimed reward.
  { from: "pending_approval", to: "approved", roles: ["distributor", "master_admin"] },
  {
    from: "pending_approval",
    to: "rejected",
    roles: ["distributor", "master_admin"],
    requiresReason: true,
  },
  // Admin staff processes an approved claim, then dispatches from factory.
  { from: "approved", to: "processing", roles: ["admin_staff", "master_admin"] },
  {
    from: "processing",
    to: "dispatched_from_factory",
    roles: ["admin_staff", "master_admin"],
  },
  // Admin staff may dispatch straight from approved too (skip explicit processing).
  {
    from: "approved",
    to: "dispatched_from_factory",
    roles: ["admin_staff", "master_admin"],
  },
  // Distributor confirms delivery to the dealer.
  { from: "dispatched_from_factory", to: "delivered", roles: ["distributor", "master_admin"] },
  // Cancellation is allowed from any pre-delivery state.
  { from: "pending_approval", to: "cancelled", roles: ["distributor", "admin_staff", "master_admin"] },
  { from: "approved", to: "cancelled", roles: ["admin_staff", "master_admin"] },
  { from: "processing", to: "cancelled", roles: ["admin_staff", "master_admin"] },
];

/** Find the transition rule for a from->to move, or undefined if it isn't a legal transition. */
export function findRewardClaimTransition(
  from: RewardClaimStatus,
  to: RewardClaimStatus,
): Transition | undefined {
  return REWARD_CLAIM_TRANSITIONS.find((tr) => tr.from === from && tr.to === to);
}

/** True when `role` may move a claim from `from` to `to`. */
export function canTransitionRewardClaim(
  role: string,
  from: RewardClaimStatus,
  to: RewardClaimStatus,
): boolean {
  const tr = findRewardClaimTransition(from, to);
  return Boolean(tr && tr.roles.includes(role as WorkflowRole));
}

/** Next statuses a given role can move a claim to from its current status. */
export function allowedNextStatuses(role: string, from: RewardClaimStatus): RewardClaimStatus[] {
  return REWARD_CLAIM_TRANSITIONS.filter(
    (tr) => tr.from === from && tr.roles.includes(role as WorkflowRole),
  ).map((tr) => tr.to);
}

/** Terminal states — no further transitions. */
export function isTerminalRewardClaimStatus(status: RewardClaimStatus): boolean {
  return status === "delivered" || status === "rejected" || status === "cancelled";
}

/** Normalize any stored value (incl. legacy status/free text) to a valid workflow status. */
export function normalizeRewardClaimStatus(value: unknown): RewardClaimStatus {
  const v = String(value ?? "").trim();
  if ((REWARD_CLAIM_STATUSES as readonly string[]).includes(v)) return v as RewardClaimStatus;
  // Map legacy `status` column values.
  if (v === "delivered") return "delivered";
  if (v === "approved") return "approved";
  return "pending_approval";
}
