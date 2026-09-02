import { api } from "@/lib/api-client";
import type { SessionUser } from "@/lib/mock/distributor/types";

export type DistributorProfile = {
  id: string;
  name: string;
  region: string | null;
  phone: string | null;
};

export async function getDistributorProfile(): Promise<{
  user: SessionUser;
  distributor: DistributorProfile | null;
}> {
  return api.get("/api/v1/distributor/profile");
}
