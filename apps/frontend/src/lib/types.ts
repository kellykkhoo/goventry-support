// apps/frontend/src/lib/types.ts
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
  agency_name: string | null;
  agency_code: string | null;
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

export interface ProposedAction {
  id: number;
  action_type: "reply" | "status_change" | "assignment" | "tag_change" | "internal_note";
  issue_id: number;
  proposer: string;
  proposed_payload: Record<string, unknown>;
  final_payload: Record<string, unknown> | null;
  required_tier: "auto" | "human" | "admin";
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  reviewer_id: number | null;
  reject_reason: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface ApprovalListResponse {
  items: ProposedAction[];
  total: number;
  page: number;
  per_page: number;
}

export interface KnowledgeEntry {
  id: number;
  title: string;
  content: string;
  source_type: "doc" | "resolved_ticket";
  visibility: "agency_specific" | "global_sanitized" | "internal_admin_only";
  agency_id: number | null;
  issue_id: number | null;
  created_at: string;
}

export interface KnowledgeListResponse {
  items: KnowledgeEntry[];
  total: number;
}

export interface DailyReport {
  date: string;
  agency_id: number | null;
  new_today: number;
  open_total: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  top_open: Array<{ id: number; title: string; priority: string; status: string }>;
}

export interface WeeklyReport {
  week_start: string;
  week_end: string;
  agency_id: number | null;
  new_this_week: number;
  resolved_this_week: number;
  open_total: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  top_open: Array<{ id: number; title: string; priority: string; status: string }>;
}

export interface HermesJobRun {
  id: number;
  job_name: string;
  issue_id: number | null;
  status: string;
  result_summary: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface HermesReport {
  id: number;
  report_type: string;
  agency_id: number | null;
  slack_sent: boolean;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SlackDeliveryLog {
  id: number;
  report_type: string;
  channel_hint: string | null;
  status: string;
  error_message: string | null;
  payload_preview: string | null;
  created_at: string;
}

export interface DraftFeedback {
  id: number;
  issue_id: number;
  proposed_action_id: number | null;
  feedback_category: string;
  reviewer_notes: string | null;
  ticket_category: string | null;
  product_area: string | null;
  agency_id: number | null;
  created_at: string;
}
