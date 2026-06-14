/**
 * Runs at deploy startup (see render.yaml). Seeds the demo data ONLY if the
 * database is empty, so the first deploy populates agencies/team/sample tickets
 * and later deploys leave existing data untouched (idempotent — never wipes).
 */
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

const db = new PrismaClient();

async function main() {
  const agencies = await db.agency.count().catch(() => 0);
  if (agencies > 0) {
    console.log(`[seed-if-empty] ${agencies} agencies present — skipping seed.`);
    return;
  }
  console.log("[seed-if-empty] empty database — seeding demo data…");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}

main()
  .catch((e) => {
    console.error("[seed-if-empty] failed:", e);
    // Don't crash the deploy if seeding fails — the app can still start.
  })
  .finally(() => db.$disconnect());
