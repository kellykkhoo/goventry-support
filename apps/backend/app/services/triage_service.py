# apps/backend/app/services/triage_service.py
# Python port of src/lib/triage.ts. Direct Anthropic SDK, tool-use loop, background thread.
import os
import json
import sys
import threading
from datetime import datetime, timezone

from ..extensions import db
from ..models.issue import Issue, Priority, Product, IssueType
from .knowledge_service import knowledge_service
from .gitlab_service import gitlab_service
from ..models.proposed_action import ActionType
from .approval_service import approval_service

MODEL = "claude-opus-4-8"
MAX_TOKENS = 8000
MAX_TURNS = 8

OUTPUT_SCHEMA_HINT = """Return ONLY valid JSON (no prose, no markdown fences) matching:
{
  "issueType": "FeatureRequest|Bug|UserGuideQuestion|RegistrationEvent",
  "product": "GovEntry|GovSupply|GovRewards|null",
  "priority": "Low|Medium|High|Urgent",
  "duplicateOfIssueId": integer|null,
  "similarTickets": [{"id": int, "title": str, "similarity": str}],
  "draftReply": string,
  "confidence": 0.0-1.0,
  "summary": string
}"""

TOOLS = [
    {"name": "search_knowledge_base",
     "description": "Search the internal knowledge base for relevant support articles.",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
    {"name": "search_tickets",
     "description": "Search resolved tickets for similar past issues.",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
    {"name": "search_gitlab_docs",
     "description": (
         "Search the live product source repositories (GovEntry, GovRewards, GovSupply) "
         "for relevant documentation, API specs, or code context. "
         "Use this when the ticket mentions a specific feature, API, webhook, or error "
         "that may be documented in the product repos."
     ),
     "input_schema": {
         "type": "object",
         "properties": {
             "query": {"type": "string", "description": "Search term or phrase"},
             "repo": {
                 "type": "string",
                 "enum": ["all", "goventry", "govrewards", "govsupply"],
                 "description": "Which repo to search. Default: all",
             },
         },
         "required": ["query"],
     }},
]

_PRIORITY = {p.value: p for p in Priority}
_PRODUCT = {p.value: p for p in Product}
_ISSUE_TYPE = {t.value: t for t in IssueType}


def _build_client():
    import anthropic
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def _system_prompt(issue: Issue) -> str:
    return (
        "You are GovEntry Support's triage agent. Classify the ticket, find duplicates, "
        "and draft a reply for human review.\n"
        "Products: GovEntry, GovSupply, GovRewards.\n"
        "Before drafting a reply, use your tools to gather context:\n"
        "1. search_knowledge_base — check internal support articles.\n"
        "2. search_tickets — check if a similar issue was resolved before.\n"
        "3. search_gitlab_docs — search the live product repos for relevant docs, "
        "API specs, or code. Use this whenever the ticket mentions a specific feature, "
        "webhook, API endpoint, or error message.\n"
        f"{OUTPUT_SCHEMA_HINT}"
    )


def _run_tool(name: str, tool_input: dict, agency_id: int) -> list:
    query = tool_input.get("query", "")
    if name == "search_knowledge_base":
        return knowledge_service.search_knowledge_base(query, agency_id)
    if name == "search_tickets":
        return knowledge_service.search_tickets(query, agency_id)
    if name == "search_gitlab_docs":
        repo_param = tool_input.get("repo", "all")
        repos = None if repo_param == "all" else [repo_param]
        try:
            return gitlab_service.search_docs(query, repos)
        except Exception:  # noqa: BLE001
            return []
    return []


def _parse_json(text: str) -> dict | None:
    text = text.strip()
    if "{" not in text or "}" not in text:
        return None
    try:
        return json.loads(text[text.find("{"): text.rfind("}") + 1])
    except Exception:  # noqa: BLE001
        return None


def run_triage(issue_id: int) -> dict | None:
    """Run triage synchronously in the CURRENT thread/app-context. Returns parsed dict or None."""
    issue = db.session.get(Issue, issue_id)
    if issue is None:
        return None
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("[triage] ANTHROPIC_API_KEY unset; skipping triage.", file=sys.stderr)
        return None

    client = _build_client()
    messages = [{"role": "user", "content":
                 f"Ticket #{issue.id}\nTitle: {issue.title}\nDescription: {issue.description}"}]

    parsed = None
    for _ in range(MAX_TURNS):
        resp = client.messages.create(
            model=MODEL, max_tokens=MAX_TOKENS,
            system=_system_prompt(issue), tools=TOOLS, messages=messages,
        )
        if resp.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": resp.content})
            tool_results = []
            for block in resp.content:
                if getattr(block, "type", None) == "tool_use":
                    out = _run_tool(block.name, block.input, issue.agency_id)
                    tool_results.append({"type": "tool_result", "tool_use_id": block.id,
                                         "content": json.dumps(out)})
            messages.append({"role": "user", "content": tool_results})
            continue
        text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        parsed = _parse_json(text)
        break

    if parsed is None:
        print("[triage] could not parse model output.", file=sys.stderr)
        return None

    issue.ai_triage_json = parsed
    issue.triaged_at = datetime.now(timezone.utc)
    if parsed.get("priority") in _PRIORITY:
        issue.priority = _PRIORITY[parsed["priority"]]
    if parsed.get("product") in _PRODUCT:
        issue.product = _PRODUCT[parsed["product"]]
    if parsed.get("issueType") in _ISSUE_TYPE:
        issue.issue_type = _ISSUE_TYPE[parsed["issueType"]]
    db.session.commit()
    draft = parsed.get("draftReply")
    if draft:
        approval_service.propose(
            action_type=ActionType.reply, issue=issue,
            proposed_payload={"body": draft}, proposer="agent:triage")
    return parsed


def triage_in_background(app, issue_id: int) -> None:
    """Flask does not propagate app context into threads — push our own."""
    def _run():
        with app.app_context():
            try:
                run_triage(issue_id)
            except Exception as exc:  # noqa: BLE001
                print(f"[triage] background failure: {exc}", file=sys.stderr)
    threading.Thread(target=_run, daemon=True).start()
