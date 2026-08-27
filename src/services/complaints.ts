import type { DistributorComplaint } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";
import { isNotFoundError } from "@/lib/api-errors";

export async function getComplaints(simulateError = false): Promise<DistributorComplaint[]> {
  if (simulateError) throw new Error("Failed to load complaints");
  const res = await api.get<DistributorComplaint[] | { items: DistributorComplaint[] }>("/api/v1/complaints");
  return Array.isArray(res) ? res : (res.items ?? []);
}

export async function getComplaintById(
  id: string,
  simulateError = false,
): Promise<DistributorComplaint | null> {
  if (simulateError) throw new Error("Failed to load complaint");
  try {
    return await api.get<DistributorComplaint>(`/api/v1/complaints/${id}`);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
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
