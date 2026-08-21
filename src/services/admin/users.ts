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
  name: string;
  store_name: string;
  phone: string;
  address: string;
  status: SignupApplication["status"];
  created_at: string;
};

export async function listSignupApplications(
  filters: { search?: string; status?: string; page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<SignupApplication>> {
  const rows = await api.get<SignupApiRow[]>("/api/v1/admin/signup-applications");
  let items: SignupApplication[] = rows.map((r) => ({
    id: r.id,
    businessName: r.store_name,
    contactName: r.name,
    phone: r.phone,
    city: r.address.split(",").pop()?.trim() ?? r.address,
    submittedAt: r.created_at,
    status: r.status,
  }));

  if (filters.search) {
    const q = filters.search.toLowerCase();
    items = items.filter((s) =>
      [s.businessName, s.contactName, s.phone, s.city].some((v) => v.toLowerCase().includes(q)),
    );
  }
  if (filters.status && filters.status !== "all") {
    items = items.filter((s) => s.status === filters.status);
  }

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const total = items.length;
  const offset = (page - 1) * pageSize;

  return {
    items: items.slice(offset, offset + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
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

export async function reviewSignup(_id: string, _status: "approved" | "rejected"): Promise<void> {
  throw new Error("Signup review is not available in the demo API");
}
