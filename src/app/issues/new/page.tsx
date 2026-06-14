import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createIssue } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function NewIssuePage() {
  const [agencies, team] = await Promise.all([
    db.agency.findMany({ orderBy: { code: "asc" } }),
    db.teamMember.findMany(),
  ]);

  async function action(formData: FormData) {
    "use server";
    const { id } = await createIssue(formData);
    redirect(`/issues/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-5 text-lg font-semibold text-white">New issue</h1>
      <form action={action} className="card flex flex-col gap-4 p-5">
        <input name="title" placeholder="Title" required className="input" />
        <textarea name="description" placeholder="Description" rows={5} className="input" />
        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm text-muted">
            Product
            <select name="product" className="input mt-1">
              <option>GovEntry</option>
              <option>GovSupply</option>
              <option>GovRewards</option>
            </select>
          </label>
          <label className="text-sm text-muted">
            Type
            <select name="issueType" className="input mt-1">
              <option>Feature Request</option>
              <option>Bug</option>
              <option>User Guide Question</option>
            </select>
          </label>
          <label className="text-sm text-muted">
            Priority
            <select name="priority" defaultValue="Medium" className="input mt-1">
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Urgent</option>
            </select>
          </label>
          <label className="text-sm text-muted">
            Assignee
            <select name="assigneeId" className="input mt-1">
              <option value="">Unassigned</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="text-sm text-muted">
          Agencies
          <div className="mt-2 flex flex-wrap gap-3">
            {agencies.map((a) => (
              <label key={a.code} className="flex items-center gap-1.5 text-zinc-300">
                <input type="checkbox" name="agencies" value={a.code} className="accent-indigo-500" />
                {a.code}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn self-start">
          Create issue
        </button>
      </form>
    </div>
  );
}
