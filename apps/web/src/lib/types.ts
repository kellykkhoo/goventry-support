// apps/web/src/lib/types.ts
export interface Issue {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  product: string | null;
  issue_type: string | null;
  source: string;
  agency_id: number;
  assignee_id: number | null;
  requester_name: string | null;
  requester_email: string | null;
  ai_triage_json: Record<string, unknown> | null;
  ai_draft_reply: string | null;
  triaged_at: string | null;
  resolution_summary: string | null;
  created_at: string;
}

export interface IssueListResponse {
  items: Issue[];
  total: number;
  page: number;
  per_page: number;
}

export interface TicketMessage {
  id: number;
  direction: "outbound" | "inbound" | "note";
  sender_name: string | null;
  body: string;
  created_at: string;
}

export interface AgencyCard {
  id: number;
  code: string;
  name: string;
  counts: Record<string, number>;
}

export interface TopRequest {
  id: number;
  title: string;
  distinct_agency_count: number;
  status: string;
}

export interface AgenciesResponse {
  agencies: AgencyCard[];
  top_requests: TopRequest[];
}

export interface TeamMember {
  id: number;
  name: string;
  role_label: string;
}
