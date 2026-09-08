const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(res: Response): Promise<{ message: string; code?: string }> {
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    return { message: body.error ?? res.statusText, code: body.code };
  } catch {
    return { message: res.statusText };
  }
}

// P0-3: one-shot handling for a suspended account. The server returns 401 { code: "USER_SUSPENDED" }
// on any request once an account is suspended. We clear local state and redirect to the login page
// with ?reason=suspended EXACTLY once, so we never loop /login → /home → guard → /.
let suspensionHandler: (() => void) | null = null;
let suspensionHandled = false;

/** Registered once at app bootstrap to clear session + navigate on a USER_SUSPENDED response. */
export function registerSuspensionHandler(handler: () => void) {
  suspensionHandler = handler;
}

function handleSuspended() {
  if (suspensionHandled) return; // one-shot per cycle
  suspensionHandled = true;
  suspensionHandler?.();
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const { message, code } = await parseError(res);
    if (code === "USER_SUSPENDED") handleSuspended();
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: "DELETE",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!res.ok) {
      // P0-4: parseError returns an OBJECT; ApiError's first arg is a string. Passing the object
      // rendered "[object Object]" in every upload-error toast. Coerce to a string message and
      // forward the code (also drives USER_SUSPENDED handling, consistent with apiRequest).
      const parsed = await parseError(res);
      const message =
        typeof parsed === "string"
          ? parsed
          : parsed.message ?? JSON.stringify(parsed);
      if (parsed.code === "USER_SUSPENDED") handleSuspended();
      throw new ApiError(message, res.status, parsed.code);
    }
    return res.json() as Promise<T>;
  },
};
