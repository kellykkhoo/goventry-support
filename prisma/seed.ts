import { PrismaClient } from "@prisma/client";
import { CANONICAL_DOCS } from "./docs";

const db = new PrismaClient();

async function main() {
  // wipe (idempotent seed)
  await db.ticketMessage.deleteMany();
  await db.issueAgency.deleteMany();
  await db.knowledgeEntry.deleteMany();
  await db.issue.deleteMany();
  await db.agency.deleteMany();
  await db.teamMember.deleteMany();

  const agencies: Record<string, number> = {};
  for (const [code, name] of [
    ["MOH", "Ministry of Health"],
    ["NEA", "National Environment Agency"],
    ["MINDEF", "Ministry of Defence"],
    ["HDB", "Housing & Development Board"],
    ["LTA", "Land Transport Authority"],
    ["MOM", "Ministry of Manpower"],
    ["MOE", "Ministry of Education"],
    ["MFA", "Ministry of Foreign Affairs"],
    ["GOVTECH", "Government Technology Agency"],
  ]) {
    const a = await db.agency.create({ data: { code, name } });
    agencies[code] = a.id;
  }

  const roy = await db.teamMember.create({ data: { name: "Roy Tan", role: "Product Manager" } });
  const kelly = await db.teamMember.create({ data: { name: "Kelly Khoo", role: "Product Operations" } });
  const jeremy = await db.teamMember.create({ data: { name: "Jeremy Ong", role: "UI/UX Designer" } });

  type Feat = {
    title: string;
    agencies: string[];
    assigneeId: number;
    priority: string;
    status: string;
    product: string;
    description?: string;
  };
  const features: Feat[] = [
    { title: "SSO Integration (Singpass/Corppass)", agencies: ["MINDEF", "MOH"], assigneeId: jeremy.id, priority: "High", status: "In Progress", product: "GovEntry" },
    { title: "Parents Gateway integration (e-authorisation)", agencies: ["MOE"], assigneeId: kelly.id, priority: "Urgent", status: "In Progress", product: "GovEntry" },
    { title: "Bulk attendee import", agencies: ["MOE", "LTA"], assigneeId: kelly.id, priority: "Medium", status: "Backlog", product: "GovEntry" },
    { title: "QR code check-in", agencies: ["NEA", "HDB"], assigneeId: jeremy.id, priority: "High", status: "Done", product: "GovEntry" },
    { title: "Waitlist management", agencies: ["MOH", "MOE"], assigneeId: roy.id, priority: "Medium", status: "Backlog", product: "GovEntry" },
    { title: "Webhook / API access for external registration systems", agencies: ["MFA", "MINDEF"], assigneeId: kelly.id, priority: "High", status: "In Progress", product: "GovEntry" },
    { title: "Identity verification (IDV) edge-case handling", agencies: ["MINDEF", "MOH", "NEA"], assigneeId: roy.id, priority: "High", status: "Backlog", product: "GovEntry" },
    { title: "Self-service training & onboarding portal", agencies: ["NEA", "HDB", "LTA"], assigneeId: jeremy.id, priority: "Low", status: "Backlog", product: "GovEntry" },
    { title: "GovWallet payout integration (rewards → credits)", agencies: ["MOM", "MOE"], assigneeId: kelly.id, priority: "Medium", status: "In Progress", product: "GovRewards" },
    { title: "Custom event branding / white-label registration page", agencies: ["LTA", "MFA"], assigneeId: jeremy.id, priority: "Low", status: "Cancelled", product: "GovEntry" },
  ];

  for (const f of features) {
    await db.issue.create({
      data: {
        title: f.title,
        description: f.description ?? "",
        status: f.status,
        priority: f.priority,
        product: f.product,
        issueType: "Feature Request",
        source: "web",
        assigneeId: f.assigneeId,
        agencies: { create: f.agencies.map((c) => ({ agencyId: agencies[c] })) },
      },
    });
  }

  // Intake submissions (as if they came through the public form)
  const intake = [
    {
      name: "Sharon Goh", agency: "NEA", product: "GovEntry", issueType: "User Guide Question", priority: "Low",
      description: "Requesting a training session for new event admins onboarding to GovEntry",
      email: "sharon_goh@nea.gov.sg",
    },
    {
      name: "Ray Lim", agency: "MFA", product: "GovEntry", issueType: "Feature Request", priority: "High",
      description: "Need to link our external summit registration system to GovEntry via API",
      email: "ray_lim@mfa.gov.sg",
    },
    {
      name: "Alvin Choong", agency: "MINDEF", product: "GovEntry", issueType: "Bug", priority: "Medium",
      description: "Some attendees fail identity verification at check-in despite valid records",
      email: "alvin_choong@mindef.gov.sg",
    },
  ];
  for (const s of intake) {
    await db.issue.create({
      data: {
        title: s.description.slice(0, 60),
        description: s.description,
        status: "Backlog",
        priority: s.priority,
        product: s.product,
        issueType: s.issueType,
        source: "intake",
        requesterName: s.name,
        requesterEmail: s.email,
        agencies: { create: [{ agencyId: agencies[s.agency] }] },
      },
    });
  }

  // Knowledge base: docs (canonical set) + past resolutions = the agent's memory
  await db.knowledgeEntry.createMany({
    data: [
      ...CANONICAL_DOCS.map((d) => ({ ...d, sourceType: "doc" })),
      {
        title: "Resolved: NEA training request for event admins (May 2026)",
        sourceType: "resolved_ticket",
        content:
          "NEA requested onboarding training for 12 new event admins. Resolution: enrolled them in the monthly group training session, shared the quick-start PDF and sandbox access. Confirmed all 12 completed training within 2 weeks. Reply template: point requester to the monthly session signup plus quick-start PDF, offer 1:1 for urgent cases.",
      },
      {
        title: "Resolved: MINDEF attendee IDV failures at gate (Apr 2026)",
        sourceType: "resolved_ticket",
        content:
          "MINDEF reported ~5% of attendees failing identity verification at check-in. Root cause: bulk import had stripped leading zeros from Official IDs. Resolution: re-imported the attendee list with format validation, advised attendance-assisted mode as interim workaround. Reply template: ask for the campaign ID and a sample failing record, suggest assisted check-in as immediate workaround.",
      },
    ],
  });

  console.log(`Seeded: 9 agencies, 3 team members, 13 issues, ${CANONICAL_DOCS.length} docs + 2 resolved.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
