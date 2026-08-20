import { adminStore } from "@/lib/mock/admin/store";
import type { AdminDashboardData } from "@/lib/mock/admin/types";
import { delay } from "./_utils";

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  await delay();
  const orders = adminStore.orders;
  const pendingApprovals = orders.filter((o) => o.status === "order_placed").length;
  const openComplaints = adminStore.complaints.filter(
    (c) => c.status === "pending" || c.status === "in_progress",
  ).length;
  const activeCampaigns = adminStore.campaigns.filter((c) => c.status === "active").length;
  const monthlySales = adminStore.monthlySales.reduce((s, m) => s + m.sales, 0);

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
    pendingSignups: adminStore.signupApplications.filter((s) => s.status === "pending"),
    openComplaints: adminStore.complaints.filter(
      (c) => c.status === "pending" || c.status === "in_progress",
    ),
  };
}
