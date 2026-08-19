export type UserRole =
  "dealer" | "distributor" | "sales_executive" | "admin_staff" | "master_admin";

export type OrderStatus =
  "pending_approval" | "approved" | "rejected" | "in_production" | "delivered";

export type ComplaintStatus = "pending" | "in_progress" | "resolved" | "rejected";

export type CampaignStatus = "active" | "upcoming" | "expired";

export type NotificationCategory = "orders" | "campaigns" | "complaints" | "system";

export type NotificationType =
  | "new_order"
  | "order_reminder"
  | "order_approved"
  | "order_rejected"
  | "campaign_new"
  | "campaign_ending"
  | "complaint_new"
  | "complaint_update"
  | "system";

export type TimelineEvent = {
  label: string;
  at: string;
  note?: string;
};

export type DealerMonthlyPerformance = {
  month: string;
  orders: number;
  orderValue: number;
};

export type DealerRewardClaim = {
  id: string;
  dealerId: string;
  name: string;
  emoji: string;
  points: number;
  claimedAt: string;
  status: "pending" | "delivered";
  deliveredAt?: string;
};

export type DistributorDealer = {
  id: string;
  distributorId: string;
  code: string;
  name: string;
  contactName?: string;
  location: string;
  address?: string;
  phone: string;
  email: string;
  gstNumber?: string;
  totalSales: number;
  monthSales: number;
  prevMonthSales: number;
  orderCount: number;
  pendingOrders: number;
  openComplaints: number;
  rewardPoints: number;
  salesGrowth: number;
  lastOrderDate: string;
  monthlyPerformance?: DealerMonthlyPerformance[];
  active: boolean;
};

export type DistributorOrderItem = {
  model: string;
  size: string;
  thickness: string;
  quantity: number;
  farma: boolean;
  farmaDetails?: string;
  mrp: number;
  dealerPrice: number;
  campaignPrice?: number;
  freeItems?: string;
  points: number;
  notes?: string;
};

export type DistributorOrder = {
  id: string;
  distributorId: string;
  dealerId: string;
  dealerName: string;
  dealerCode: string;
  storeName?: string;
  contactName?: string;
  dealerAddress?: string;
  status: OrderStatus;
  placedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  customerName?: string;
  customerPhone?: string;
  totalItems: number;
  totalValue: number;
  pendingHours: number;
  items: DistributorOrderItem[];
  timeline: TimelineEvent[];
};

export type DistributorComplaint = {
  id: string;
  distributorId: string;
  orderId: string;
  dealerId: string;
  dealerName: string;
  category: string;
  description: string;
  status: ComplaintStatus;
  createdAt: string;
  updatedAt: string;
};

export type DistributorCampaign = {
  id: string;
  distributorId: string;
  name: string;
  product: string;
  discountLabel: string;
  description: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  bannerEmoji: string;
  applicableDealers?: string[];
};

export type DistributorNotification = {
  id: string;
  distributorId: string;
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  read: boolean;
  isReminder?: boolean;
};

export type MonthlySales = { month: string; sales: number; orders: number };

export type ProductSales = { product: string; sales: number; units: number };

export type DashboardStats = {
  totalDealers: number;
  activeDealers: number;
  ordersThisMonth: number;
  monthlySales: number;
  pendingApprovals: number;
  openComplaints: number;
  rewardPointsGenerated: number;
  salesGrowth: number;
  prevMonthSales: number;
};

export type SessionUser = {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  distributorId?: string;
};
