/**
 * Reconciles the knowledge-base documentation to the canonical set on each
 * deploy: replaces all sourceType="doc" entries with CANONICAL_DOCS.
 * Leaves resolved-ticket memory (sourceType="resolved_ticket") untouched.
 */
import { PrismaClient } from "@prisma/client";
import { CANONICAL_DOCS } from "./docs";

const db = new PrismaClient();

async function main() {
  await db.knowledgeEntry.deleteMany({ where: { sourceType: "doc" } });
  await db.knowledgeEntry.createMany({
    data: CANONICAL_DOCS.map((d) => ({ ...d, sourceType: "doc" })),
  });
  console.log(`[sync-docs] documentation set to ${CANONICAL_DOCS.length} canonical entries.`);
}

main()
  .catch((e) => console.error("[sync-docs] failed:", e))
  .finally(() => db.$disconnect());
