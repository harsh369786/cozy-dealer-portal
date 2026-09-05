import { api } from "@/lib/api-client";

export type SignupApplication = {
  name: string;
  birthday: string;
  storeName?: string;
  phone: string;
  address: string;
  gstNumber?: string;
  pincode: string;
  area: string;
  submittedAt: string;
};

export type PincodeLookup = {
  pincode: string;
  state: string;
  district: string;
  areas: string[];
};

/** Resolve a 6-digit pincode to State / District / Area(s). Returns null when not found. */
export async function lookupPincode(code: string): Promise<PincodeLookup | null> {
  try {
    return await api.get<PincodeLookup>(`/api/v1/pincode/${encodeURIComponent(code)}`);
  } catch {
    return null;
  }
}

export async function submitSignupApplication(
  data: Omit<SignupApplication, "submittedAt">,
): Promise<SignupApplication> {
  const res = await api.post<{ id: string }>("/api/v1/signup/applications", data);
  return { ...data, submittedAt: new Date().toISOString(), id: res.id } as SignupApplication & { id: string };
}
