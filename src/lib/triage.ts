import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { searchKnowledgeBase, searchTickets } from "./search";
import { reposConfigured, searchRepos } from "./repos";

/**
 * The agent harness.
 *
 * Claude is the brain; this file is the harness: it hands Claude the ticket,
 * executes the search tools Claude asks for, and stores the resulting
 * classification + draft reply on the issue. It never sends anything —
 * a human approves every outbound email from the issue page.
 */

const MODEL = "claude-opus-4-8";

const REPO_TOOL: Anthropic.Tool = {
  name: "search_repos",
  description:
    "Search the product source repositories — Entry/GovEntry (registration repo), " +
    "Distribution/GovSupply (supply-core repo), Gamification/GovRewards (govrewards-core repo) — " +
    "including code, READMEs and docs. Use this to confirm how a feature actually works, whether a " +
    "capability exists (e.g. 'can GovRewards do e-vouchers'), or to ground a bug explanation in the " +
    "real code — especially when the knowledge base and past tickets don't answer the question. " +
    "Search terms matching the ticket's feature/product reach the right repo.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keywords or symbol/feature name to search for" },
    },
    required: ["query"],
  },
};

const BASE_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_knowledge_base",
    description:
      "Search internal documentation and resolved-ticket summaries (the team's memory). " +
      "Call this for every ticket before drafting a reply, to find how similar issues were handled before. " +
      "Search more than once with different terms if the first results are weak.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_tickets",
    description:
      "Search all existing issues (open and closed). Call this to check whether this request " +
      "duplicates a feature request or bug that is already tracked.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to search for" },
      },
      required: ["query"],
    },
  },
];

// Repo search is offered only when local clones are configured (see src/lib/repos.ts).
function getTools(): Anthropic.Tool[] {
  return reposConfigured() ? [...BASE_TOOLS, REPO_TOOL] : BASE_TOOLS;
}

// Run whichever search tool Claude asked for.
async function runTool(name: string, query: string): Promise<unknown> {
  if (name === "search_knowledge_base") return searchKnowledgeBase(query);
  if (name === "search_tickets") return searchTickets(query);
  if (name === "search_repos") return searchRepos(query);
  return { error: `unknown tool ${name}` };
}

/**
 * Shared agent loop: Claude decides which searches to run (knowledge base, past
 * tickets, and GitLab when configured); we execute them and feed results back,
 * up to 8 turns. Used by both initial triage and conversational refine.
 */
async function runAgentLoop(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  opts: { format?: unknown } = {},
): Promise<Anthropic.Message> {
  const tools = getTools();
  let response: Anthropic.Message;
  for (let turn = 0; ; turn++) {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      tools,
      ...(opts.format ? { output_config: { format: opts.format } } : {}),
      messages,
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (response.stop_reason !== "tool_use" || turn >= 8) break;

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const { query } = block.input as { query: string };
      try {
        const result = await runTool(block.name, query);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (e) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Search failed: ${String(e)}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
  return response;
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    issueType: {
      type: "string",
      enum: ["Feature Request", "Bug", "User Guide Question", "Registration Event"],
    },
    product: { type: "string", enum: ["GovEntry", "GovSupply", "GovRewards"] },
    priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
    duplicateOfIssueId: { type: ["integer", "null"] },
    similarTickets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          relevance: { type: "string" },
        },
        required: ["id", "title", "relevance"],
        additionalProperties: false,
      },
    },
    draftReply: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    summary: { type: "string" },
  },
  required: [
    "issueType",
    "product",
    "priority",
    "duplicateOfIssueId",
    "similarTickets",
    "draftReply",
    "confidence",
    "summary",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the support triage agent for a Singapore government product team.

Products: GovEntry (event registration, attendance and check-in), GovSupply, GovRewards (points, rewards, e-vouchers, GovWallet payouts).
Agencies served: MOH, NEA, MINDEF, HDB, LTA, MOM, MOE, MFA.
Team: Roy Tan (Product Manager), Kelly Khoo (Product Operations), Jeremy Ong (UI/UX Designer).

Feature → product → source repo (search the right one with search_repos):
- "Entry"        → GovEntry  → the "registration" repo (event registration, attendance, check-in)
- "Gamification" → GovRewards → the "govrewards-core" repo (points, rewards, e-vouchers, GovWallet payouts)
- "Distribution" → GovSupply → the "supply-core" repo
When a ticket names a feature, search that product's repo for how it actually works.

For each incoming ticket:
1. Search the knowledge base for relevant documentation and past resolutions — always do this first.
2. Search existing tickets to detect duplicates of tracked feature requests or bugs.
3. If the knowledge base and past tickets don't fully answer the question AND search_repos is available, search the relevant product repo (per the mapping above) to ground the answer in how the product actually works — do this BEFORE falling back to clarifying questions.
4. Classify the ticket and draft a reply to the requester.

Drafting rules:
- Write the reply as the GovEntry support team: professional, warm, concise. Address the requester by name.
- Ground the reply in what the knowledge base, past tickets, or product repos actually say. Never invent product capabilities, URLs, or timelines that are not in the search results.
- Only if NONE of those sources answers it, say the team is looking into it and ask one or two clarifying questions — and set confidence to "low".
- Sign off as "GovEntry Support Team".

Priority guide: Urgent = service down / event today blocked; High = blocking an upcoming event or many users; Medium = degraded but has workaround; Low = questions, training, nice-to-haves.`;

export type TriageResult = {
  issueType: string;
  product: string;
  priority: string;
  duplicateOfIssueId: number | null;
  similarTickets: { id: number; title: string; relevance: string }[];
  draftReply: string;
  confidence: "high" | "medium" | "low";
  summary: string;
};

export async function triageIssue(issueId: number): Promise<TriageResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(`[triage] Skipped issue #${issueId}: ANTHROPIC_API_KEY not set.`);
    return null;
  }

  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: { agencies: { include: { agency: true } } },
  });
  if (!issue) return null;

  const client = new Anthropic();

  const ticketAsText = [
    `New ticket #${issue.id} (source: ${issue.source})`,
    `Title: ${issue.title}`,
    `Requester: ${issue.requesterName ?? "unknown"} (${issue.requesterEmail ?? "no email"})`,
    `Agencies: ${issue.agencies.map((a) => a.agency.code).join(", ") || "none tagged"}`,
    `Reported type: ${issue.issueType}`,
    `Description:\n${issue.description}`,
  ].join("\n");

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: ticketAsText }];
  const response = await runAgentLoop(client, messages, {
    format: { type: "json_schema", schema: OUTPUT_SCHEMA },
  });

  const text = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  )?.text;
  if (!text) {
    console.warn(`[triage] Issue #${issueId}: no text output (stop_reason=${response.stop_reason}).`);
    return null;
  }

  let result: TriageResult;
  try {
    result = JSON.parse(text) as TriageResult;
  } catch {
    console.warn(`[triage] Issue #${issueId}: output was not valid JSON.`);
    return null;
  }

  await db.issue.update({
    where: { id: issueId },
    data: {
      aiTriageJson: JSON.stringify(result),
      aiDraftReply: result.draftReply,
      triagedAt: new Date(),
      // Apply classification only where the intake left defaults
      issueType: result.issueType,
      product: result.product,
    },
  });

  return result;
}

/** Fire-and-forget wrapper so webhook endpoints can respond fast (FormSG retries on slow responses). */
export function triageInBackground(issueId: number) {
  void triageIssue(issueId).catch((e) => console.error(`[triage] issue #${issueId} failed:`, e));
}

/**
 * Conversational refine: the PM asks for a change ("shorter", "mention the
 * workaround", "more formal") and Claude rewrites the draft, still grounded in
 * the knowledge base, past tickets, and GitLab. Returns the revised reply text
 * only (no JSON wrapper) so it drops straight into the editable reply box.
 */
export async function refineDraft(
  issueId: number,
  currentDraft: string,
  instruction: string,
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(`[refine] Skipped #${issueId}: ANTHROPIC_API_KEY not set.`);
    return null;
  }
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: { agencies: { include: { agency: true } } },
  });
  if (!issue) return null;

  const client = new Anthropic();
  const prompt = [
    `Ticket #${issue.id} from ${issue.requesterName ?? "a requester"} (${issue.agencies.map((a) => a.agency.code).join(", ") || "no agency"}).`,
    `Problem:\n${issue.description}`,
    ``,
    `Current draft reply:\n${currentDraft}`,
    ``,
    `Revise the draft per this instruction: "${instruction}".`,
    `Search the knowledge base, past tickets, or GitLab if the change needs facts you don't already have.`,
    `Reply with ONLY the revised email body (no preamble, no quotes, no JSON).`,
  ].join("\n");

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const response = await runAgentLoop(client, messages); // no JSON format — plain text reply

  const text = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  )?.text;
  return text?.trim() ?? null;
}
