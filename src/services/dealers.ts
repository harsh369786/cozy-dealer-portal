import type { DealerMonthlyPerformance, DealerRewardClaim, DistributorDealer } from "@/lib/mock/distributor/types";
import { DISTRIBUTOR_ID, dealers as rawDealers, seedDealerRewardClaims } from "@/lib/mock/distributor/data";

const CONTACT_NAMES: Record<string, string> = {
  "dlr-sharma": "Rajesh Sharma",
  "dlr-patil": "Sanjay Patil",
  "dlr-kulkarni": "Amit Kulkarni",
  "dlr-reddy": "Vikram Reddy",
  "dlr-menon": "Suresh Menon",
  "dlr-gupta": "Rakesh Gupta",
  "dlr-singh": "Harpreet Singh",
  "dlr-desai": "Ketan Desai",
  "dlr-iyer": "Ravi Iyer",
  "dlr-chavan": "Mahesh Chavan",
};

function defaultMonthlyPerformance(dealer: DistributorDealer): DealerMonthlyPerformance[] {
  const months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  return months.map((month, i) => ({
    month,
    orders: Math.max(1, Math.round(dealer.orderCount / 6 + (i - 3) * 2)),
    orderValue: Math.max(10000, Math.round(dealer.monthSales * (0.72 + i * 0.06))),
  }));
}

export function enrichDealer(dealer: DistributorDealer): DistributorDealer {
  const codeDigits = dealer.code.replace(/\D/g, "").slice(-4).padStart(4, "0");
  return {
    ...dealer,
    contactName: dealer.contactName ?? CONTACT_NAMES[dealer.id] ?? dealer.name.split(" ")[0],
    gstNumber: dealer.gstNumber ?? `27AABCS${codeDigits}1Z1`,
    monthlyPerformance: dealer.monthlyPerformance ?? defaultMonthlyPerformance(dealer),
  };
}

export async function getDealers(simulateError = false): Promise<DistributorDealer[]> {
  await delay();
  if (simulateError) throw new Error("Failed to load dealers");
  return rawDealers.filter((d) => d.distributorId === DISTRIBUTOR_ID).map(enrichDealer);
}

export async function getDealerById(
  id: string,
  simulateError = false,
): Promise<DistributorDealer | null> {
  await delay();
  if (simulateError) throw new Error("Failed to load dealer");
  const dealer = rawDealers.find((d) => d.id === id && d.distributorId === DISTRIBUTOR_ID);
  return dealer ? enrichDealer(dealer) : null;
}

export async function getDealerRewardClaims(dealerId: string): Promise<DealerRewardClaim[]> {
  await delay(200);
  return seedDealerRewardClaims.filter((c) => c.dealerId === dealerId);
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms));
}
