// apps/web/src/lib/api.ts
const BASE_URL = import.meta.env.VITE_API_URL ?? "";

// --- Token storage ---

export function getToken(): string | null {
  return localStorage.getItem("goventry_token");
}

export function setToken(token: string): void {
  localStorage.setItem("goventry_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("goventry_token");
}

// --- Fetch wrapper ---

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// --- Types ---

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string | null;
}

// --- Auth endpoints ---

export const api = {
  login(email: string, password: string) {
    return request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  logout() {
    return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
  },

  me() {
    return request<AuthUser>("/auth/me");
  },
};

export { ApiError };
