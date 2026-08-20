import type { DistributorComplaint } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";

export async function getComplaints(simulateError = false): Promise<DistributorComplaint[]> {
  if (simulateError) throw new Error("Failed to load complaints");
  return api.get<DistributorComplaint[]>("/api/v1/complaints");
}

export async function getComplaintById(
  id: string,
  simulateError = false,
): Promise<DistributorComplaint | null> {
  if (simulateError) throw new Error("Failed to load complaint");
  try {
    const all = await getComplaints();
    return all.find((c) => c.id === id) ?? null;
  } catch {
    return null;
  }
}

export async function getComplaintsByDealer(dealerId: string): Promise<DistributorComplaint[]> {
  const all = await getComplaints();
  return all.filter((c) => c.dealerId === dealerId);
}

export async function submitComplaint(input: {
  orderId: string;
  description: string;
  category?: string;
}) {
  return api.post<{ id: string }>("/api/v1/complaints", input);
}
