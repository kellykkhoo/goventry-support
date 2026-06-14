// apps/frontend/src/lib/api.ts
import type {
  Issue,
  IssueListResponse,
  TicketMessage,
  AgenciesResponse,
  TeamMember,
  ProposedAction,
  ApprovalListResponse,
} from "./types";

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

  listIssues(params: URLSearchParams) {
    return request<IssueListResponse>(`/issues?${params.toString()}`);
  },
  getIssue(id: number) {
    return request<Issue>(`/issues/${id}`);
  },
  listMessages(id: number) {
    return request<TicketMessage[]>(`/issues/${id}/messages`);
  },
  addNote(id: number, body: string) {
    return request<TicketMessage>(`/issues/${id}/internal-notes`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },
  updateStatus(id: number, status: string) {
    return request<Issue>(`/issues/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  updateAssignee(id: number, assignee_id: number | null) {
    return request<Issue>(`/issues/${id}/assignee`, {
      method: "PATCH",
      body: JSON.stringify({ assignee_id }),
    });
  },
  triage(id: number) {
    return request<{ ok: boolean }>(`/issues/${id}/triage`, { method: "POST" });
  },
  approveReply(id: number, body: string) {
    return request<Issue>(`/issues/${id}/approve-reply`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },
  listAgencies() {
    return request<AgenciesResponse>("/agencies");
  },
  listTeam() {
    return request<TeamMember[]>("/team");
  },
  listApprovals(params: URLSearchParams) {
    return request<ApprovalListResponse>(`/approvals?${params.toString()}`);
  },
  getApproval(id: number) {
    return request<ProposedAction>(`/approvals/${id}`);
  },
  approveProposal(id: number, finalPayload?: Record<string, unknown>) {
    return request<ProposedAction>(`/approvals/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ final_payload: finalPayload ?? null }),
    });
  },
  rejectProposal(id: number, reason: string) {
    return request<ProposedAction>(`/approvals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
};

export { ApiError };
