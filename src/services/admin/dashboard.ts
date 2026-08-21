import type { AdminDashboardData } from "@/lib/mock/admin/types";
import { adminStore } from "@/lib/mock/admin/store";
import { delay } from "./_utils";
import { listSignupApplications } from "./users";

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  await delay();
  const orders = adminStore.orders;
  const pendingApprovals = orders.filter((o) => o.status === "order_placed").length;
  const openComplaints = adminStore.complaints.filter(
    (c) => c.status === "pending" || c.status === "in_progress",
  ).length;
  const activeCampaigns = adminStore.campaigns.filter((c) => c.status === "active").length;
  const monthlySales = adminStore.monthlySales.reduce((s, m) => s + m.sales, 0);

  let pendingSignups = adminStore.signupApplications.filter((s) => s.status === "pending");
  try {
    const result = await listSignupApplications({ page: 1, pageSize: 5, status: "pending" });
    pendingSignups = result.items;
  } catch {
    // Keep mock fallback when API unavailable
  }

  return {
    stats: {
      monthlySales,
      totalOrders: orders.length,
      totalDealers: adminStore.dealers.length,
      totalDistributors: Object.keys(adminStore.distributors).length,
      pendingApprovals,
      openComplaints,
      activeCampaigns,
    },
    monthlySales: adminStore.monthlySales,
    topProducts: adminStore.productSales,
    recentOrders: orders.slice(0, 5).map((o) => ({
      id: o.id,
      dealerName: o.dealerName,
      dealerCode: o.dealerCode,
      distributorName: adminStore.distributors[o.distributorId]?.name ?? "—",
      status: o.status,
      placedAt: o.placedAt,
      totalValue: o.totalValue,
      totalItems: o.totalItems,
    })),
    pendingSignups,
    openComplaints: adminStore.complaints.filter(
      (c) => c.status === "pending" || c.status === "in_progress",
    ),
  };
}
