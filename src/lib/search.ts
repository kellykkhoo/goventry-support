import { db } from "./db";

/**
 * Lightweight keyword search used by the triage agent's tools.
 *
 * Deliberately simple: at this scale (hundreds of rows) ranking by keyword
 * overlap in JS beats setting up a vector/embedding pipeline. If search
 * quality ever disappoints, swap this for Postgres full-text search or
 * embeddings — the agent's tool interface stays identical.
 */
function terms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2))];
}

function score(text: string, ts: string[]): number {
  const hay = text.toLowerCase();
  return ts.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
}

export async function searchKnowledgeBase(query: string, limit = 5) {
  const ts = terms(query);
  const rows = await db.knowledgeEntry.findMany();
  return rows
    .map((r) => ({ r, s: score(`${r.title} ${r.content}`, ts) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ r }) => ({
      id: r.id,
      title: r.title,
      sourceType: r.sourceType,
      content: r.content,
    }));
}

export async function searchTickets(query: string, limit = 5) {
  const ts = terms(query);
  const rows = await db.issue.findMany({
    include: { agencies: { include: { agency: true } } },
  });
  return rows
    .map((r) => ({ r, s: score(`${r.title} ${r.description} ${r.issueType}`, ts) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ r }) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      issueType: r.issueType,
      priority: r.priority,
      agencies: r.agencies.map((a) => a.agency.code),
      description: r.description.slice(0, 300),
      resolutionSummary: r.resolutionSummary,
    }));
}
