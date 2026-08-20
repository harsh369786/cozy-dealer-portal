import { adminStore } from "@/lib/mock/admin/store";
import type { AdminUser, ListFilters, PaginatedResult, SignupApplication } from "@/lib/mock/admin/types";
import type { UserRole } from "@/lib/mock/distributor/types";
import { delay, matchesQuery, paginate } from "./_utils";

export type UserListFilters = ListFilters & {
  role?: UserRole | "signup" | "all";
};

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return phone.trim();
}

function audienceLabel(role: UserRole) {
  return role.replace("_", " ");
}

export async function listUsers(filters: UserListFilters = {}): Promise<PaginatedResult<AdminUser>> {
  await delay();
  let items = [...adminStore.users];
  if (filters.role && filters.role !== "all" && filters.role !== "signup") {
    items = items.filter((u) => u.role === filters.role);
  }
  if (filters.search) {
    items = items.filter((u) =>
      matchesQuery(filters.search, u.name, u.phone, u.dealerName, u.distributorName),
    );
  }
  if (filters.status) {
    items = items.filter((u) => u.status === filters.status);
  }
  return paginate(items, filters);
}

export async function getUser(id: string): Promise<AdminUser | null> {
  await delay();
  return adminStore.users.find((u) => u.id === id) ?? null;
}

export async function listSignupApplications(
  filters: ListFilters = {},
): Promise<PaginatedResult<SignupApplication>> {
  await delay();
  let items = [...adminStore.signupApplications];
  if (filters.status) {
    items = items.filter((s) => s.status === filters.status);
  }
  if (filters.search) {
    items = items.filter((s) =>
      matchesQuery(filters.search, s.businessName, s.contactName, s.phone, s.city),
    );
  }
  return paginate(items, filters);
}

/** @deprecated Use inviteUser — creates active user without invite flow */
export async function createUser(input: Omit<AdminUser, "id" | "createdAt" | "status">): Promise<AdminUser> {
  return inviteUser(input);
}

export async function inviteUser(
  input: Omit<AdminUser, "id" | "createdAt" | "status" | "invitedAt" | "inviteSentVia">,
): Promise<AdminUser> {
  await delay();
  const phone = normalizePhone(input.phone);
  const now = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const user: AdminUser = {
    ...input,
    phone,
    id: `usr-${Date.now()}`,
    status: "pending_invite",
    createdAt: now,
    invitedAt: now,
    inviteSentVia: "whatsapp",
  };
  adminStore.users.unshift(user);

  adminStore.whatsappOutbox.unshift({
    id: `wa-${Date.now()}`,
    toPhone: phone,
    templateKey: "user_invite",
    sentAt: new Date().toLocaleString("en-IN"),
  });

  if (typeof console !== "undefined") {
    console.info(
      `[whatsapp:mock] user_invite → ${phone}`,
      `Hi ${input.name}, you've been invited to BackRest as ${audienceLabel(input.role)}. Download the app and sign up with this number.`,
    );
  }

  return user;
}

export async function resendUserInvite(id: string): Promise<void> {
  await delay();
  const user = adminStore.users.find((u) => u.id === id);
  if (!user || user.status !== "pending_invite") throw new Error("User is not pending invite");

  user.invitedAt = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  adminStore.whatsappOutbox.unshift({
    id: `wa-${Date.now()}`,
    toPhone: user.phone,
    templateKey: "user_invite",
    sentAt: new Date().toLocaleString("en-IN"),
  });
}

export function activateInvitedUserByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  const user = adminStore.users.find((u) => u.phone === normalized && u.status === "pending_invite");
  if (user) user.status = "active";
}

export async function updateUserStatus(id: string, status: AdminUser["status"]): Promise<void> {
  await delay();
  const user = adminStore.users.find((u) => u.id === id);
  if (user) user.status = status;
}

export async function reviewSignup(id: string, status: "approved" | "rejected"): Promise<void> {
  await delay();
  const app = adminStore.signupApplications.find((s) => s.id === id);
  if (!app) return;
  app.status = status;
  if (status === "approved") {
    activateInvitedUserByPhone(app.phone);
  }
}
