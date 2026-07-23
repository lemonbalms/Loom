/**
 * Print Loom session dashboard for humans and coding agents (Codex/Claude/Grok).
 * Usage: bun run status
 *        bun run handoff:lint  (or: bun run scripts/session-status.ts --lint)
 *
 * Phase D: handoff:lint = structure checks; status parser fail-loud.
 * Dashboard v1 (step 1): one compact table (≤80 chars/cell) — no long R{n} paste.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractHandoffSection,
  ONE_LINE_RESUME_HEADING,
} from "./handoff-headings.ts";
import {
  HANDOFF_UTF8_BUDGET,
  lintLiveHandoff,
  validateCheckpoint,
} from "./handoff-lint.ts";
import {
  formatSessionRoutingStatus,
  parseSessionRouting,
} from "./session-routing.ts";

const root = join(import.meta.dir, "..");

export { HANDOFF_UTF8_BUDGET };

/** Loud marker when a status field cannot be parsed (design §9.3 / Owner D4). */
export const STATUS_MALFORMED = "unknown/malformed";

/** Soft cap per dashboard cell (proposal Session Dashboard v1). */
export const DASHBOARD_CELL_MAX = 80;

function read(rel: string): string {
  const p = join(root, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

/**
 * Extract first capture group, or STATUS_MALFORMED when text empty / no match.
 * Never returns a silent placeholder that looks like a healthy empty state.
 */
export function matchRequired(text: string, re: RegExp): string {
  if (!text || !text.trim()) return STATUS_MALFORMED;
  const m = re.exec(text);
  const v = m?.[1]?.trim();
  return v && v.length > 0 ? v : STATUS_MALFORMED;
}

/** Collapse whitespace and hard-cap length (keeps fail-loud marker intact). */
export function clipCell(value: string, max = DASHBOARD_CELL_MAX): string {
  const one = value.replace(/\s+/g, " ").trim();
  if (one === STATUS_MALFORMED) return STATUS_MALFORMED;
  if (one.length <= max) return one;
  return `${one.slice(0, Math.max(0, max - 1))}…`;
}

/** Parse plan_review Open (blocking) — fail-loud on missing/unparseable shape. */
export function parseOpenBlocking(review: string): string {
  if (!review || !review.trim()) return STATUS_MALFORMED;
  const start = review.indexOf("## Open (blocking)");
  if (start < 0) return STATUS_MALFORMED;
  const end = review.indexOf("\n## ", start + 10);
  const section = review.slice(start, end > start ? end : start + 1200);
  const tableMatch = section.match(
    /\|[^\n]+\|\n\|[-| :]+\|\n([\s\S]*?)(?:\n\n|\n### |\n## |$)/,
  );
  if (!tableMatch) return STATUS_MALFORMED;
  const tableBody = tableMatch[1] ?? "";
  if (/\(none\)/i.test(tableBody) || tableBody.trim() === "") {
    return "없음";
  }
  const ids = [...tableBody.matchAll(/^\|\s*\*\*([^*|]+)\*\*/gm)].map((m) =>
    m[1]!.trim(),
  );
  if (ids.length) return ids.join(", ");
  const plain = [...tableBody.matchAll(/^\|\s*([^|]+?)\s*\|/gm)]
    .map((m) => m[1]!.trim())
    .filter((c) => c && !c.startsWith("---") && c !== "ID" && c !== "Item");
  // Skip separator-like and (none) already handled
  const meaningful = plain.filter((c) => !/^\(none\)$/i.test(c) && c !== "—");
  if (meaningful.length && !meaningful.every((c) => c === "—")) {
    // First column values that look like IDs
    const firstCol = [...tableBody.matchAll(/^\|\s*([^|]+?)\s*\|/gm)]
      .map((m) => m[1]!.trim())
      .filter((c) => c && !c.startsWith("---") && c !== "ID");
    const openIds = firstCol.filter(
      (c) => c !== "(none)" && c !== "—" && !/^item$/i.test(c),
    );
    if (openIds.length) return openIds.slice(0, 5).join(", ");
  }
  return STATUS_MALFORMED;
}

/** Latest review id only (e.g. R46) — not the full header essay. */
export function parseReviewId(review: string): string {
  if (!review || !review.trim()) return STATUS_MALFORMED;
  const m =
    />\s*\*\*최신:\*\*\s*\*\*(R\d+)\*\*/.exec(review) ||
    />\s*\*\*최신:\*\*\s*(R\d+)\b/.exec(review) ||
    /\*\*최신:\*\*[^*]*\*\*(R\d+)\*\*/.exec(review);
  return m?.[1]?.trim() ? m[1]!.trim() : STATUS_MALFORMED;
}

/** One-line resume from canonical heading only — no legacy whole-file fallback. */
export function parseOneLineResume(handoff: string): string {
  if (!handoff || !handoff.trim()) return STATUS_MALFORMED;
  const resumeSection = extractHandoffSection(handoff, ONE_LINE_RESUME_HEADING);
  if (!resumeSection) return STATUS_MALFORMED;
  return matchRequired(resumeSection, />\s*(.+)/);
}

/** Unique ### gate title under Current action. */
export function parseGateTitle(handoff: string): string {
  if (!handoff || !handoff.trim()) return STATUS_MALFORMED;
  const action = extractHandoffSection(handoff, "Current action");
  if (!action) return STATUS_MALFORMED;
  const titles = [...action.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1]!.trim());
  if (titles.length !== 1) return STATUS_MALFORMED;
  return titles[0]!;
}

/** Compress Current loop four axes into one short line. */
export function parseLoopLine(handoff: string): string {
  if (!handoff || !handoff.trim()) return STATUS_MALFORMED;
  const loop = extractHandoffSection(handoff, "Current loop");
  if (!loop) return STATUS_MALFORMED;
  const row = (axis: string): string | null => {
    const re = new RegExp(
      `\\|\\s*${axis}\\s*\\|\\s*([^|]+?)\\s*\\|`,
      "i",
    );
    const m = re.exec(loop);
    return m?.[1]?.trim() || null;
  };
  const product = row("Product");
  const dogfood = row("Dogfood");
  const harness = row("Harness");
  const reuse = row("Reuse");
  if (!product && !dogfood && !harness && !reuse) return STATUS_MALFORMED;

  const short = (label: string, raw: string | null): string => {
    if (!raw) return `${label}?`;
    const t = raw.toLowerCase();
    if (/not proven/.test(t)) return `${label}—`;
    const ver = /\bv?\d+\.\d+\.\d+\b/.exec(raw);
    if (ver) return `${label} ${ver[0].replace(/^v/i, "")}`;
    if (/shipped|complete|done|ok|unblocked/.test(t)) return `${label} ok`;
    if (/eligible|pending|blocked/.test(t)) return `${label}…`;
    return `${label}·`;
  };

  return [
    short("P", product),
    short("D", dogfood),
    short("H", harness),
    short("R", reuse),
  ].join(" · ");
}

/** Blockers body: (none) or clipped list. */
export function parseBlockersLine(handoff: string): string {
  if (!handoff || !handoff.trim()) return STATUS_MALFORMED;
  const blockers = extractHandoffSection(handoff, "Blockers");
  if (!blockers) return STATUS_MALFORMED;
  const body = blockers.replace(/^## Blockers\s*/i, "").trim();
  if (!body) return STATUS_MALFORMED;
  if (/^\(none\)$/im.test(body)) return "(none)";
  const first = body.split("\n").map((l) => l.trim()).filter(Boolean)[0];
  return first || STATUS_MALFORMED;
}

/** Owner pending decision names (first table column), short. */
export function parseOwnerPendingLine(handoff: string): string {
  if (!handoff || !handoff.trim()) return STATUS_MALFORMED;
  const section = extractHandoffSection(handoff, "Owner pending");
  if (!section) return STATUS_MALFORMED;
  const rows = [...section.matchAll(/^\|\s*([^|]+?)\s*\|/gm)]
    .map((m) => m[1]!.trim())
    .filter(
      (c) =>
        c &&
        !c.startsWith("---") &&
        !/^decision$/i.test(c) &&
        c !== "Decision",
    );
  if (!rows.length) return STATUS_MALFORMED;
  // Prefer short labels: strip markdown bold
  const labels = rows
    .map((r) => r.replace(/\*\*/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4);
  return labels.length ? labels.join(" · ") : STATUS_MALFORMED;
}

/** First few Don't redo themes, keyword-style. */
export function parseDontLine(handoff: string): string {
  if (!handoff || !handoff.trim()) return STATUS_MALFORMED;
  const section = extractHandoffSection(handoff, "Don't redo");
  if (!section) return STATUS_MALFORMED;
  const bullets = [...section.matchAll(/^[-*]\s+(.+)$/gm)].map((m) =>
    m[1]!.trim(),
  );
  if (!bullets.length) return STATUS_MALFORMED;
  const keys = bullets.slice(0, 3).map((b) => {
    // First clause before · or —
    const head = b.split(/[·—]/)[0]!.trim();
    return head.length > 28 ? `${head.slice(0, 27)}…` : head;
  });
  return keys.join(" · ");
}

export type DashboardFields = {
  product: string;
  review: string;
  gate: string;
  line: string;
  loop: string;
  blockers: string;
  owner: string;
  dont: string;
  health: string;
};

export function buildDashboardFields(opts?: {
  planText?: string;
  reviewText?: string;
  handoffText?: string;
}): DashboardFields {
  const plan = opts?.planText ?? read("docs/PLAN.md");
  const review = opts?.reviewText ?? read("docs/plan_review.md");
  const handoff = opts?.handoffText ?? read("HANDOFF.md");

  const version = matchRequired(
    plan,
    /\|\s*\*\*Version\*\*\s*\|\s*\*\*([^*]+)\*\*/,
  );
  const status = matchRequired(
    plan,
    /\|\s*\*\*Status\*\*\s*\|\s*\*\*`?([^`|*]+)`?/,
  );
  const product =
    version === STATUS_MALFORMED || status === STATUS_MALFORMED
      ? STATUS_MALFORMED
      : `v${version.replace(/^v/i, "")} · \`${status}\``;

  const reviewId = parseReviewId(review);
  const openBlock = parseOpenBlocking(review);
  const reviewLine =
    reviewId === STATUS_MALFORMED && openBlock === STATUS_MALFORMED
      ? STATUS_MALFORMED
      : reviewId === STATUS_MALFORMED
        ? `? · open ${openBlock}`
        : openBlock === STATUS_MALFORMED
          ? `${reviewId} · open ${STATUS_MALFORMED}`
          : `${reviewId} · open **${openBlock}**`;

  const gate = parseGateTitle(handoff);
  const routing = parseSessionRouting(handoff);
  const line = routing.ok
    ? formatSessionRoutingStatus(routing.routing)
    : STATUS_MALFORMED;

  const loop = parseLoopLine(handoff);
  const blockers = parseBlockersLine(handoff);
  const owner = parseOwnerPendingLine(handoff);
  const dont = parseDontLine(handoff);

  const structure = validateCheckpoint(handoff, {
    requireEvidenceTargets: true,
    enforceBudget: true,
  });
  const parseOk = ![
    product,
    reviewLine,
    gate,
    line,
    loop,
    blockers,
  ].some((v) => v === STATUS_MALFORMED || v.includes(STATUS_MALFORMED));
  const health =
    structure.length === 0 && parseOk
      ? "handoff:lint ✓ · parse ✓"
      : structure.length > 0 && !parseOk
        ? "handoff:lint ✗ · parse ✗"
        : structure.length > 0
          ? "handoff:lint ✗ · parse ✓"
          : "handoff:lint ✓ · parse ✗";

  return {
    product: clipCell(product),
    review: clipCell(reviewLine),
    gate: clipCell(gate),
    line: clipCell(line),
    loop: clipCell(loop),
    blockers: clipCell(blockers),
    owner: clipCell(owner),
    dont: clipCell(dont),
    health: clipCell(health),
  };
}

/**
 * Session Dashboard v1 — one compact table for session start.
 * AGENTS briefing should echo this output (no second schema).
 */
export function buildStatus(opts?: {
  planText?: string;
  reviewText?: string;
  handoffText?: string;
  /**
   * Optional inject budget snippet for CLI `bun run status` only.
   * Do **not** pass this from session-context (would recurse via measure→buildStatus).
   * Examples: `inject:full` · `inject:omit` · `inject:>target`
   */
  injectHealth?: string;
}): string {
  const f = buildDashboardFields(opts);
  const health =
    opts?.injectHealth && opts.injectHealth.length > 0
      ? `${f.health} · ${opts.injectHealth}`
      : f.health;

  return `## Loom · session
| Key | Value |
|-----|--------|
| Product | ${f.product} |
| Review | ${f.review} |
| Gate | ${f.gate} |
| Line | ${f.line} |
| Loop | ${f.loop} |
| Blockers | ${f.blockers} |
| Owner | ${f.owner} |
| Don't | ${f.dont} |
| Health | ${health} |

SSOT: HANDOFF.md · PLAN · plan_review · DOGFOOD §0.5
Run: bun run status · handoff:check · bun test
`;
}

/**
 * CLI-only inject health label (lazy import — never call from buildStateParts).
 */
export async function measureInjectHealthLabel(): Promise<string> {
  try {
    const sc = await import("./session-context.ts");
    const report = sc.measureStateBudget();
    if (report.omitted.length > 0) {
      return `inject:omit(${report.omitted.length})`;
    }
    if (report.rawChars > sc.STATE_TARGET) {
      return `inject:>target`;
    }
    return "inject:full";
  } catch {
    return "inject:?";
  }
}

/**
 * HANDOFF.md whole-file UTF-8 budget. Returns a one-line warning or null.
 */
export function checkHandoffBudget(): string | null {
  const p = join(root, "HANDOFF.md");
  if (!existsSync(p)) return null;
  const text = readFileSync(p, "utf8");
  const fullBytes = Buffer.byteLength(text, "utf8");
  if (fullBytes > HANDOFF_UTF8_BUDGET) {
    return `⚠ HANDOFF full = ${fullBytes}B > ${HANDOFF_UTF8_BUDGET}B — 종결 웨이브를 docs/HANDOFF_ARCHIVE.md로 이관(규칙 D1)`;
  }
  return null;
}

if (import.meta.main) {
  const lintOnly = process.argv.includes("--lint");
  const budgetWarn = checkHandoffBudget();

  if (lintOnly) {
    const structureErrors = lintLiveHandoff();
    const all: string[] = [...structureErrors];
    if (budgetWarn && !all.some((e) => e.includes("UTF-8 size"))) {
      all.push(budgetWarn);
    }
    // Section inject budget table lives in `bun run session-context:lint`
    // (session-context imports this module — do not import back here).
    if (all.length > 0) {
      for (const e of all) {
        console.error(`handoff:lint FAIL — ${e}`);
      }
      process.exit(1);
    }
    process.exit(0);
  }

  const injectHealth = await measureInjectHealthLabel();
  console.log(buildStatus({ injectHealth }));
  if (budgetWarn) {
    console.log(budgetWarn);
  }
}
