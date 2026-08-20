import { api } from "@/lib/api-client";

export type SignupApplication = {
  name: string;
  birthday: string;
  storeName: string;
  phone: string;
  address: string;
  gstNumber: string;
  distributorName: string;
  submittedAt: string;
};

export async function submitSignupApplication(
  data: Omit<SignupApplication, "submittedAt">,
): Promise<SignupApplication> {
  const res = await api.post<{ id: string }>("/api/v1/signup/applications", data);
  return { ...data, submittedAt: new Date().toISOString(), id: res.id } as SignupApplication & { id: string };
}
