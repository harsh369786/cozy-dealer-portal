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

const STORAGE_KEY = "backrest-signup-applications";

export async function submitSignupApplication(
  data: Omit<SignupApplication, "submittedAt">,
): Promise<SignupApplication> {
  await new Promise((r) => setTimeout(r, 400));
  const application: SignupApplication = {
    ...data,
    submittedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    const existing = loadApplications();
    existing.push(application);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  }
  return application;
}

function loadApplications(): SignupApplication[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SignupApplication[];
  } catch {
    return [];
  }
}
