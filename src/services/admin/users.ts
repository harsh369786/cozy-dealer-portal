import type { PaginatedResult } from "@/lib/mock/admin/types";
import type { AdminUser, SignupApplication } from "@/lib/mock/admin/types";
import type { UserRole } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";

export type UserListFilters = {
  search?: string;
  role?: UserRole | "signup" | "all";
  status?: string;
  page?: number;
  pageSize?: number;
};

function qs(filters: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && value !== "all") params.set(key, String(value));
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

export async function listUsers(filters: UserListFilters = {}): Promise<PaginatedResult<AdminUser>> {
  return api.get(
    `/api/v1/admin/users${qs({
      search: filters.search,
      role: filters.role === "signup" ? undefined : filters.role,
      status: filters.status,
      page: filters.page,
      pageSize: filters.pageSize,
    })}`,
  );
}

export async function getUser(id: string): Promise<AdminUser | null> {
  try {
    return await api.get<AdminUser>(`/api/v1/admin/users/${id}`);
  } catch {
    return null;
  }
}

type SignupApiRow = {
  id: string;
  userId: string | null;
  name: string;
  storeName: string;
  phone: string;
  address: string;
  distributorName: string;
  status: SignupApplication["status"];
  createdAt: string;
  submittedAtLabel: string;
};

function mapSignupRow(r: SignupApiRow): SignupApplication {
  return {
    id: r.id,
    businessName: r.storeName,
    contactName: r.name,
    phone: r.phone,
    city: r.address.split(",").pop()?.trim() ?? r.address,
    submittedAt: r.createdAt,
    status: r.status,
    distributorName: r.distributorName,
    address: r.address,
  };
}

export async function listSignupApplications(
  filters: { search?: string; status?: string; page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<SignupApplication>> {
  const result = await api.get<PaginatedResult<SignupApiRow>>(
    `/api/v1/admin/signup-applications${qs({
      search: filters.search,
      status: filters.status ?? "pending",
      page: filters.page,
      pageSize: filters.pageSize,
    })}`,
  );

  return {
    ...result,
    items: result.items.map(mapSignupRow),
  };
}

export async function createUser(input: {
  name: string;
  phone: string;
  role: UserRole;
  dealerId?: string | null;
  distributorId?: string | null;
}): Promise<AdminUser> {
  return api.post("/api/v1/admin/users", input);
}

/** Creates an active user (demo flow — no WhatsApp invite queue). */
export async function inviteUser(input: {
  name: string;
  phone: string;
  role: UserRole;
  dealerId?: string | null;
  distributorId?: string | null;
}): Promise<AdminUser> {
  return createUser(input);
}

export async function updateUserStatus(id: string, status: AdminUser["status"]): Promise<void> {
  if (status === "pending_invite") return;
  await api.patch(`/api/v1/admin/users/${id}`, { status });
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/api/v1/admin/users/${id}`);
}

export async function resendUserInvite(_id: string): Promise<void> {
  throw new Error("Invite resend is not available in the demo API");
}

export type ReviewSignupInput =
  | {
      action: "approve";
      role: Exclude<UserRole, "master_admin">;
      distributorId?: string | null;
      salesExecutiveUserId?: string | null;
    }
  | { action: "reject"; note?: string | null };

export async function reviewSignup(id: string, input: ReviewSignupInput): Promise<void> {
  await api.patch(`/api/v1/admin/signup-applications/${id}`, input);
}

export async function countPendingSignups(): Promise<number> {
  const result = await listSignupApplications({ page: 1, pageSize: 1, status: "pending" });
  return result.total;
}
