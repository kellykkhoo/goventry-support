/**
 * Shared field extraction + normalization for incoming support submissions
 * (used by both the FormSG and GovEntry webhook receivers) so a ticket comes
 * out the same regardless of channel.
 */

/** Find a value whose KEY matches the pattern. Keys are trimmed first
 *  (form labels often have stray spaces, e.g. "Name "). */
export function findField(fields: Record<string, string>, pattern: RegExp): string | undefined {
  const key = Object.keys(fields).find((k) => pattern.test(k.trim()));
  const val = key ? fields[key] : undefined;
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

/** Long option labels like "Bug — Something isn't working…" -> canonical type. */
export function normalizeIssueType(v?: string): string | undefined {
  if (!v) return undefined;
  const s = v.toLowerCase();
  if (s.includes("bug")) return "Bug";
  if (s.includes("feature")) return "Feature Request";
  if (s.includes("support") || s.includes("help") || s.includes("guide") || s.includes("question"))
    return "User Guide Question";
  return v;
}

/** "High — I'm blocked…" / "How is this impacting…: High" -> "High". */
export function normalizeSeverity(v?: string): string | undefined {
  const m = v?.match(/\b(low|medium|high|urgent)\b/i);
  if (!m) return undefined;
  const w = m[1].toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export type SupportFields = {
  name?: string;
  email?: string;
  ccTo?: string;
  agency?: string;
  feature?: string;
  product?: string;
  issueType?: string;
  severity?: string;
  description?: string;
};

/** Extract a normalized support ticket from a flat label->answer map. */
export function extractSupportFields(fields: Record<string, string>): SupportFields {
  return {
    name: findField(fields, /name/i),
    email: findField(fields, /e-?mail/i),
    ccTo: findField(fields, /cc to|^cc$/i),
    agency: findField(fields, /agency/i),
    feature: findField(fields, /feature|enquiry about/i),
    product: findField(fields, /^product$/i),
    issueType: normalizeIssueType(findField(fields, /issue type|type of issue|issue are you raising/i)),
    severity: normalizeSeverity(findField(fields, /severity|impact/i)),
    description: findField(fields, /describe|description|details of|your issue|your message/i),
  };
}
