import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createIssue } from "@/app/actions";

export const dynamic = "force-dynamic";

/**
 * Public support intake form (no login). Submissions create a ticket with
 * source "intake" and are triaged by the AI automatically.
 */
export default async function SupportPage() {
  const agencies = await db.agency.findMany({ orderBy: { code: "asc" } });

  async function action(formData: FormData) {
    "use server";
    formData.set("source", "intake");
    formData.set("title", String(formData.get("description") ?? "").slice(0, 80));
    await createIssue(formData);
    redirect("/support?submitted=1");
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-lg font-semibold text-white">Contact GovEntry Support</h1>
      <p className="mb-5 text-xs text-muted">
        Submit a feature request, bug report, or question. We reply by email.
      </p>
      <form action={action} className="card flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-4">
          <input name="requesterName" placeholder="Your name" required className="input" />
          <input
            name="requesterEmail"
            type="email"
            placeholder="Contact email"
            required
            className="input"
          />
          <label className="text-sm text-muted">
            Agency
            <select name="agencies" required className="input mt-1">
              {agencies.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted">
            Product
            <select name="product" className="input mt-1">
              <option>GovEntry</option>
              <option>GovSupply</option>
              <option>GovRewards</option>
            </select>
          </label>
          <label className="text-sm text-muted">
            Issue type
            <select name="issueType" className="input mt-1">
              <option>Feature Request</option>
              <option>Bug</option>
              <option>User Guide Question</option>
            </select>
          </label>
          <label className="text-sm text-muted">
            Severity
            <select name="priority" defaultValue="Medium" className="input mt-1">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </label>
        </div>
        <textarea
          name="description"
          rows={5}
          placeholder="Describe the issue or request…"
          required
          className="input"
        />
        <button type="submit" className="btn self-start">
          Submit
        </button>
      </form>
    </div>
  );
}
