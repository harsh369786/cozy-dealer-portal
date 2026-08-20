export type UserRole =
  | "dealer"
  | "distributor"
  | "sales_executive"
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
  | "assignments:write";

export type SessionUser = {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  dealerId?: string;
  distributorId?: string;
  permissions: Permission[];
};

export type ApiEnv = {
  DB: D1Database;
  ASSETS?: R2Bucket;
  WHATSAPP_QUEUE?: Queue;
  JWT_SECRET?: string;
  ENVIRONMENT?: string;
  Bindings?: ApiEnv;
};

export type AppVariables = {
  user: SessionUser;
  sessionId: string;
};
