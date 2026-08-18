import type { DistributorComplaint } from "@/lib/mock/distributor/types";
import { DISTRIBUTOR_ID, seedComplaints } from "@/lib/mock/distributor/data";

export async function getComplaints(simulateError = false): Promise<DistributorComplaint[]> {
  await delay();
  if (simulateError) throw new Error("Failed to load complaints");
  return seedComplaints.filter((c) => c.distributorId === DISTRIBUTOR_ID);
}

export async function getComplaintById(
  id: string,
  simulateError = false,
): Promise<DistributorComplaint | null> {
  await delay();
  if (simulateError) throw new Error("Failed to load complaint");
  return seedComplaints.find((c) => c.id === id && c.distributorId === DISTRIBUTOR_ID) ?? null;
}

export async function getComplaintsByDealer(dealerId: string): Promise<DistributorComplaint[]> {
  const all = await getComplaints();
  return all.filter((c) => c.dealerId === dealerId);
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms));
}
