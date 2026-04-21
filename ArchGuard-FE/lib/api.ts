const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ── Dev-mode bypass token ──
// In dev mode, we skip real auth and use a hardcoded token.
// Replace this with the JWT you get from POST /auth/login when ready.
const DEV_TOKEN = process.env.NEXT_PUBLIC_DEV_TOKEN ?? "dev-bypass";

function getToken(): string {
  if (typeof window === "undefined") return DEV_TOKEN;
  return localStorage.getItem("archguard_token") ?? DEV_TOKEN;
}

export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("archguard_token", token);
  }
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("archguard_token");
  }
}

// ── Generic fetch wrapper ──

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

export async function fetchApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body?.detail ?? res.statusText);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// ── Convenience methods ──

export const api = {
  get: <T>(path: string) => fetchApi<T>(path),

  post: <T>(path: string, body?: unknown) =>
    fetchApi<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown) =>
    fetchApi<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown) =>
    fetchApi<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) =>
    fetchApi<T>(path, { method: "DELETE" }),

  upload: <T>(path: string, formData: FormData) =>
    fetchApi<T>(path, {
      method: "POST",
      headers: {} as Record<string, string>, // let browser set Content-Type for multipart
      body: formData,
    }),
};
