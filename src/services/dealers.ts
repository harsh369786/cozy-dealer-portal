import type { DistributorDealer } from "@/lib/mock/distributor/types";
import { DISTRIBUTOR_ID, dealers } from "@/lib/mock/distributor/data";

export async function getDealers(simulateError = false): Promise<DistributorDealer[]> {
  await delay();
  if (simulateError) throw new Error("Failed to load dealers");
  return dealers.filter((d) => d.distributorId === DISTRIBUTOR_ID);
}

export async function getDealerById(
  id: string,
  simulateError = false,
): Promise<DistributorDealer | null> {
  await delay();
  if (simulateError) throw new Error("Failed to load dealer");
  return dealers.find((d) => d.id === id && d.distributorId === DISTRIBUTOR_ID) ?? null;
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms));
}
