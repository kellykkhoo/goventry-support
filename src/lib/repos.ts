import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileP = promisify(execFile);

/**
 * Product-knowledge search over the LOCAL clones of the product repos
 * (e.g. ~/Documents/registration, supply-core, govrewards-core).
 *
 * Uses `git grep` against each checkout — fast, no token, fully offline.
 * Only the matching snippets are returned (and later sent to Claude); the
 * repos never leave your machine.
 *
 * NOTE: clones are point-in-time. They reflect your last `git pull`, not the
 * live remote. Run `npm run repos:pull` to refresh (see package.json).
 *
 * Configure via .env:
 *   REPO_PATHS  comma-separated absolute paths to the clones, e.g.
 *               "/Users/you/Documents/registration,/Users/you/Documents/supply-core"
 */

// folder name -> product label, so results read in product terms
const PRODUCT_LABEL: Record<string, string> = {
  registration: "GovEntry",
  "supply-core": "GovSupply",
  "govrewards-core": "GovRewards",
};

function repoPaths(): string[] {
  return (process.env.REPO_PATHS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function reposConfigured(): boolean {
  return repoPaths().length > 0;
}

type RepoHit = { repo: string; file: string; line: string; text: string };

// Keep results to real product code/docs — drop dev tooling, lockfiles, builds.
// `,glob` magic makes ** match across directories, including the repo root
// (without it, **/vendor/** misses a top-level vendor/ dir).
const EXCLUDES = [
  ":(exclude,glob).agents/**",
  ":(exclude,glob).claude/**",
  ":(exclude,glob).github/**",
  ":(exclude,glob).vscode/**",
  ":(exclude,glob)**/vendor/**", // third-party Go deps, not product code
  ":(exclude,glob)**/node_modules/**",
  ":(exclude,glob)**/.gitlab-ci.yml",
  ":(exclude,glob)**/.golangci.yml",
  ":(exclude,glob)**/*-lock.json",
  ":(exclude,glob)**/pnpm-lock.yaml",
  ":(exclude,glob)**/yarn.lock",
  ":(exclude,glob)**/*.lock",
  ":(exclude,glob)**/dist/**",
  ":(exclude,glob)**/build/**",
  ":(exclude,glob)**/*.min.*",
  ":(exclude,glob)**/*.snap",
];

async function gitGrep(repo: string, patterns: string[], label: string, max: number): Promise<RepoHit[]> {
  const args = ["-C", repo, "grep", "-n", "-I", "-i", "--no-color", "-F"];
  for (const p of patterns) args.push("-e", p);
  args.push("--", ".", ...EXCLUDES);
  try {
    const { stdout } = await execFileP("git", args, { maxBuffer: 8 * 1024 * 1024, timeout: 15000 });
    return stdout
      .split("\n")
      .filter(Boolean)
      .slice(0, max)
      .map((l) => l.match(/^(.*?):(\d+):(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({ repo: label, file: m[1], line: m[2], text: m[3].slice(0, 200).trim() }));
  } catch (e: unknown) {
    const err = e as { code?: number; stderr?: string };
    if (err.code === 1) return []; // exit 1 = no matches, not an error
    return [{ repo: label, file: "(search error)", line: "", text: String(err.stderr ?? e) }];
  }
}

export async function searchRepos(query: string, maxPerRepo = 20): Promise<RepoHit[]> {
  const paths = repoPaths();
  if (paths.length === 0) return [];

  const phrase = query.trim();
  const words = [...new Set(phrase.split(/\s+/).filter((t) => t.length > 2))].slice(0, 6);

  // Fallback term: the single most distinctive word (longest, ≥5 chars) — avoids
  // matching programming-common words like "import"/"points" across the repo.
  const distinctive = words
    .filter((w) => w.length >= 5)
    .sort((a, b) => b.length - a.length)[0];

  const hits: RepoHit[] = [];
  for (const repo of paths) {
    const label = PRODUCT_LABEL[path.basename(repo)] ?? path.basename(repo);
    // Phrase match first (precise); fall back to the most distinctive single word.
    let repoHits = await gitGrep(repo, [phrase], label, maxPerRepo);
    if (repoHits.length === 0 && distinctive && distinctive !== phrase) {
      repoHits = await gitGrep(repo, [distinctive], label, maxPerRepo);
    }
    hits.push(...repoHits);
  }
  return hits;
}
