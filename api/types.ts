export type UserRole =
  | "dealer"
  | "distributor"
  | "sales_executive"
  | "sales_head"
  | "admin_staff"
  | "master_admin";

export type Permission =
  | "orders:read"
  | "orders:create"
  | "orders:approve"
  | "orders:reject"
  | "orders:status:fulfillment"
  | "orders:cancel"
  | "dealers:read"
  | "catalog:read"
  | "catalog:write"
  | "campaigns:read"
  | "campaigns:write"
  | "rewards:read"
  | "rewards:redeem"
  | "complaints:read"
  | "complaints:create"
  | "complaints:update"
  | "notifications:read"
  | "reports:read"
  | "users:read"
  | "users:write"
  | "settings:read"
  | "settings:write"
  | "audit:read"
  | "signup:review"
  | "assignments:read"
  | "assignments:write"
  | "visits:read"
  | "visits:create";

export type UserAccountStatus = "pending_approval" | "active" | "suspended" | "rejected";

export type SessionUser = {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  status: UserAccountStatus;
  dealerId?: string;
  distributorId?: string;
  permissions: Permission[];
};

export type ApiEnv = {
  DB: D1Database;
  ASSETS?: Fetcher;
  WHATSAPP_QUEUE?: Queue;
  OTP_IP_RATE_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
  OTP_PHONE_RATE_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
  JWT_SECRET?: string;
  ENVIRONMENT?: string;
  ALLOWED_ORIGINS?: string;
  CRON_SECRET?: string;
  MOCK_OTP?: string;
  DEMO_LOGINS_ENABLED?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  Bindings?: ApiEnv;
};

export type AppVariables = {
  user: SessionUser;
  sessionId: string;
  db: D1Database;
};
