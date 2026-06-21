# apps/backend/app/services/docs_importer.py
import re
import httpx
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

PUBLIC_DOCS: dict[str, list[dict]] = {
    "GovEntry": [
        {
            "url": "https://docs.developer.tech.gov.sg/docs/02-integration-with-goventry/",
            "title": "[GovEntry] Integration Guide",
            "description": (
                "Official GovEntry integration guide. Covers onboarding requirements, "
                "how government agencies integrate with GovEntry for event registration management, "
                "authentication setup, agency configuration, and step-by-step integration instructions."
            ),
        },
        {
            "url": "https://docs.developer.tech.gov.sg/docs/03-webhook-specifications/",
            "title": "[GovEntry] Webhook Specifications",
            "description": (
                "GovEntry webhook specifications. Covers supported event types (registration, "
                "cancellation, attendance, waitlist), webhook payload formats, signature verification "
                "using HMAC, retry policies, endpoint requirements, and error handling."
            ),
        },
        {
            "url": "https://docs.developer.tech.gov.sg/docs/04-api-specifications/",
            "title": "[GovEntry] API Specifications",
            "description": (
                "GovEntry API specifications. Covers authentication methods, available REST endpoints, "
                "request and response payload formats, pagination, rate limits, error codes, "
                "and sample API calls for event and registration management."
            ),
        },
    ],
    "GovRewards": [
        {
            "url": "https://docs.developer.tech.gov.sg/docs/govrewards-user-guide/?product=GovRewards",
            "title": "[GovRewards] User Guide",
            "description": (
                "Official GovRewards user guide. Covers the rewards points system, how civil servants "
                "earn and redeem points, participating merchants and partner categories, account "
                "management, agency administrator functions, and common troubleshooting steps."
            ),
        },
    ],
    "GovSupply": [
        {
            "url": "https://docs.developer.tech.gov.sg/docs/govsupply/?product=GovSupply",
            "title": "[GovSupply] Documentation",
            "description": (
                "Official GovSupply documentation. Covers government procurement workflows, "
                "product catalogue browsing, order placement and tracking, supplier management, "
                "agency-specific supply chain processes, and GovSupply system administration."
            ),
        },
    ],
}

# Flat list of (url, title) for use in triage system prompt
PUBLIC_DOC_URLS: dict[str, list[str]] = {
    product: [d["url"] for d in docs]
    for product, docs in PUBLIC_DOCS.items()
}

_SKIP_TAGS = {"script", "style", "nav", "header", "footer", "aside"}
_JS_LOADING_SIGNALS = {"please wait", "loading...", "javascript", "enable javascript"}


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP_TAGS:
            self._depth += 1

    def handle_endtag(self, tag):
        if tag in _SKIP_TAGS and self._depth > 0:
            self._depth -= 1

    def handle_data(self, data):
        if self._depth == 0:
            stripped = data.strip()
            if stripped:
                self._parts.append(stripped)

    def get_text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self._parts)).strip()


def _is_js_shell(text: str) -> bool:
    """Return True if the fetched page is a JS loading shell with no real content."""
    lower = text.lower()
    return len(text) < 500 or any(sig in lower for sig in _JS_LOADING_SIGNALS)


def fetch_doc_content(url: str) -> str:
    """Fetch a doc URL at runtime and return cleaned text (used by triage tool)."""
    try:
        with httpx.Client(verify=False, timeout=15, headers={"User-Agent": "GovEntrySupport/1.0"}) as client:
            resp = client.get(url, follow_redirects=True)
            resp.raise_for_status()
            parser = _TextExtractor()
            parser.feed(resp.text)
            text = parser.get_text()
            if _is_js_shell(text):
                # Find the matching predefined entry and return its description instead
                for docs in PUBLIC_DOCS.values():
                    for entry in docs:
                        if entry["url"].split("?")[0] == url.split("?")[0]:
                            return (
                                f"{entry['description']}\n\n"
                                f"Official docs URL: {entry['url']}\n"
                                "(Note: full page content requires a browser — direct users to this URL.)"
                            )
                return f"Official documentation at: {url}\n(Page requires JavaScript to render full content.)"
            return text[:8000]
    except Exception as exc:
        return f"[Error fetching {url}: {exc}]"


def seed_all_docs(db) -> list[str]:
    """
    Upsert KB entries for all PUBLIC_DOCS. For JS-rendered sites, stores the
    predefined description + URL so the triage agent can reference them.
    Returns list of entry titles created.
    """
    from ..models.knowledge_entry import KnowledgeEntry, SourceType, Visibility

    stale = db.session.scalars(
        db.select(KnowledgeEntry).where(
            KnowledgeEntry.source_type == SourceType.doc,
            KnowledgeEntry.visibility == Visibility.global_sanitized,
            KnowledgeEntry.agency_id.is_(None),
        )
    ).all()
    for e in stale:
        if e.title.startswith("[Gov"):
            db.session.delete(e)
    db.session.flush()

    created: list[str] = []

    with httpx.Client(
        verify=False, timeout=20, follow_redirects=True,
        headers={"User-Agent": "GovEntrySupport/1.0"},
    ) as client:
        for product, docs in PUBLIC_DOCS.items():
            for doc in docs:
                url = doc["url"]
                predefined_title = doc["title"]
                predefined_desc = doc["description"]

                # Try fetching live content; fall back to predefined description if JS shell
                live_content = None
                try:
                    resp = client.get(url)
                    resp.raise_for_status()
                    parser = _TextExtractor()
                    parser.feed(resp.text)
                    text = parser.get_text()
                    if not _is_js_shell(text):
                        live_content = text[:6000]
                except Exception:
                    pass

                content = (
                    f"Source: {url}\n\n{live_content}"
                    if live_content
                    else f"Source: {url}\n\n{predefined_desc}"
                )

                entry = KnowledgeEntry(
                    title=predefined_title,
                    content=content,
                    source_type=SourceType.doc,
                    visibility=Visibility.global_sanitized,
                )
                db.session.add(entry)
                created.append(predefined_title)

    db.session.commit()
    return created
