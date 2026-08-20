import type {
  CampaignStatus,
  ComplaintStatus,
  DistributorOrder,
  NotificationCategory,
  OrderStatus,
  UserRole,
} from "@/lib/mock/distributor/types";

export type AdminUserStatus = "active" | "suspended" | "pending_invite";

export type AdminUser = {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  status: AdminUserStatus;
  dealerId?: string;
  dealerName?: string;
  distributorId?: string;
  distributorName?: string;
  region?: string;
  createdAt: string;
  invitedAt?: string;
  inviteSentVia?: "whatsapp";
};

export type SignupApplication = {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  city: string;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
};

export type AdminProduct = {
  id: string;
  name: string;
  category: string;
  guarantee: string;
  thicknesses: string[];
  fixedSize?: string;
  mrp: number;
  dealerPrice: number;
  points: number;
  rewardPercent: number;
  rewardEligibility: "dealer" | "distributor" | "both";
  rewardRuleActive: boolean;
  freeItems?: string;
  blurb: string;
  image: string;
  status: "active" | "archived";
  layerGroup?: string;
};

export type AdminOrderListItem = {
  id: string;
  dealerName: string;
  dealerCode: string;
  distributorName: string;
  status: OrderStatus;
  placedAt: string;
  totalValue: number;
  totalItems: number;
};

export type AdminOrderDetail = DistributorOrder & {
  distributorName: string;
};

export type CampaignType = "price" | "sell" | "distributor";

export type AdminCampaign = {
  id: string;
  type: CampaignType;
  name: string;
  product: string;
  productId?: string;
  discountPercent?: number;
  specialPrice?: number;
  goal?: string;
  reward?: string;
  target?: number;
  done?: number;
  distributorId?: string;
  distributorName?: string;
  description: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  badgeLabel?: string;
  active: boolean;
  whatsappTargetDealers: boolean;
  whatsappTargetDistributors: boolean;
};

export type AdminRewardCatalogItem = {
  id: string;
  emoji: string;
  name: string;
  pointsRequired: number;
  active: boolean;
};

export type AdminRewardClaim = {
  id: string;
  dealerId: string;
  dealerName: string;
  rewardName: string;
  emoji: string;
  points: number;
  status: "pending" | "delivered";
  claimedAt: string;
  deliveredAt?: string;
};

export type AdminComplaint = {
  id: string;
  orderId: string;
  dealerId: string;
  dealerName: string;
  distributorName: string;
  category: string;
  description: string;
  status: ComplaintStatus;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
  history: Array<{ label: string; at: string; note?: string }>;
};

export type NotificationAudience =
  | "all_dealers"
  | "all_distributors"
  | "all_users"
  | "dealers"
  | "distributors"
  | "admin_staff";

export type AdminNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  recipientScope: string;
  audience: NotificationAudience;
  read: boolean;
  active: boolean;
  sendAt: string;
  popupEnabled: boolean;
  maxImpressions: number;
  impressionCount: number;
  createdAt: string;
  whatsappTargetDealers?: boolean;
  whatsappTargetDistributors?: boolean;
};

export type AdminNotificationInput = {
  title: string;
  body: string;
  category: NotificationCategory;
  audience: NotificationAudience;
  sendAt: string;
  popupEnabled: boolean;
  maxImpressions: number;
};

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
};

export type SystemSetting = {
  key: string;
  label: string;
  value: string;
  group: "otp" | "reminders" | "features" | "notifications";
  description?: string;
};

export type AdminDashboardData = {
  stats: {
    monthlySales: number;
    totalOrders: number;
    totalDealers: number;
    totalDistributors: number;
    pendingApprovals: number;
    openComplaints: number;
    activeCampaigns: number;
  };
  monthlySales: Array<{ month: string; sales: number; orders: number }>;
  topProducts: Array<{ product: string; sales: number; units: number }>;
  recentOrders: AdminOrderListItem[];
  pendingSignups: SignupApplication[];
  openComplaints: AdminComplaint[];
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ListFilters = {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};
