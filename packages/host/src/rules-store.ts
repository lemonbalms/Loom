/**
 * PLAN 0.35.0 P3 — rules store (D3 · D5 · R12 · ② 규칙 파일 / 규칙 병합).
 * Sources: bundled `packages/host/rules/*.md` (text-imported so the single-file dist bundle
 * carries them — the skill-materialize SKILL.md mechanism) + `<loomDir>/rules/*.md` (≤ 256).
 * A rule file is `---` / `key: value` lines (id · scope · priority, all required, nothing else)
 * / `---` / body. Within one source a repeated id keeps the code-unit-smaller file name and
 * records a conflict; a user file replaces the bundled rule of the same id wholesale; an empty
 * user body disables the id. Bodies over 8192 B are cut on a code-point boundary and flagged.
 * Invalid files are skipped and listed — `loadRules` never throws on content (bad arguments →
 * TypeError). Read-only: nothing is created or written. Not wired into any prompt (0.36).
 */
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { sanitizePeerText } from "@loom/protocol";
import reportBlockersRule from "../rules/report-blockers.md" with { type: "text" };
import { redactSecrets } from "./redact";

/** Body cap per rule file (D5). */
export const RULE_MAX_BYTES = 8192;
/** User rule files considered (R14 scan cap). */
export const RULES_USER_SCAN_MAX = 256;
/** Raw bytes read per user file; the front-matter must fit, the body is cut to 8 KiB anyway. */
const RULE_READ_MAX_BYTES = 64 * 1024;

const RULE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RULE_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.md$/;
const PRIORITY_RE = /^(0|[1-9][0-9]{0,3})$/;
const FM_LINE_RE = /^([a-z][a-z0-9_-]*):[ \t]*(.*?)[ \t]*$/;
const RULE_KEYS = ["id", "scope", "priority"] as const;
const SCOPES: readonly string[] = ["all", "claude", "codex", "grok"];

export type RuleScope = "all" | "claude" | "codex" | "grok";
export type RuleSource = "bundled" | "user";
/** `override` = a user rule replacing a bundled id · `disabled` = empty user body. */
export type RuleStatus = "bundled" | "user" | "override" | "disabled";

export type BundledRule = { file: string; text: string };

/** R12: exactly one bundled rule in 0.35.0. */
export const BUNDLED_RULES: readonly BundledRule[] = Object.freeze([
  Object.freeze({ file: "report-blockers.md", text: reportBlockersRule }),
]);

export type RuleView = {
  id: string;
  scope: RuleScope;
  priority: number;
  status: RuleStatus;
  source: RuleSource;
  file: string;
  /** Absolute path (user) or `bundled:<file>`. */
  path: string;
  /** True file size in bytes (stat for user files · text length for bundled). */
  bytes: number;
  truncated: boolean;
  /** Body (≤ 8192 B). */
  body: string;
};

export type InvalidRuleFile = { source: RuleSource; file: string; path: string; reason: string };

export type RuleConflict = { source: RuleSource; id: string; kept: string; dropped: string[] };

export type RulesView = {
  /** Every effective id (disabled included), priority desc → id asc. */
  rules: RuleView[];
  invalid: InvalidRuleFile[];
  conflicts: RuleConflict[];
  counts: { bundled: number; user: number; overrides: number; disabled: number; invalid: number };
  /** `<loomDir>/rules`. */
  userDir: string;
  userDirState: "absent" | "dir" | "unsafe";
  /** More than 256 user `*.md` entries — only the first 256 (sorted) were read. */
  scanCapped: boolean;
};

type Parsed =
  | {
      ok: true;
      id: string;
      scope: RuleScope;
      priority: number;
      body: string;
      bytes: number;
      truncated: boolean;
      /** The whole (untruncated) cleaned body is whitespace-only → a user file disables the id. */
      empty: boolean;
    }
  | { ok: false; reason: string };

/** Explicit empty env: shape redaction only, never process.env (R53-L3). */
const NO_ENV: Record<string, string | undefined> = Object.freeze({}) as Record<
  string,
  string | undefined
>;

function cmpCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Largest prefix ≤ `cap` bytes ending on a code-point boundary. */
function cutAt(bytes: Buffer, cap: number): Buffer {
  let end = cap;
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end);
}

/**
 * Parse one rule file's text (② 규칙 파일). The body is cleaned on read (sanitizePeerText +
 * redactSecrets(·, {}) — R53-L3), then cut at 8192 B. `readCut` = the file was longer than the
 * read prefix, so the body is truncated whatever its prefix length.
 */
function parseRuleText(text: string, fileBytes: number, readCut: boolean): Parsed {
  let pos = 0;
  const nextLine = (): string | null => {
    if (pos > text.length) return null;
    const nl = text.indexOf("\n", pos);
    let line: string;
    if (nl === -1) {
      line = text.slice(pos);
      pos = text.length + 1;
    } else {
      line = text.slice(pos, nl);
      pos = nl + 1;
    }
    return line.endsWith("\r") ? line.slice(0, -1) : line;
  };
  if (nextLine() !== "---")
    return { ok: false, reason: "missing front-matter (first line must be ---)" };
  const fields = new Map<string, string>();
  for (;;) {
    const line = nextLine();
    if (line === null) return { ok: false, reason: "unterminated front-matter (no closing ---)" };
    if (line === "---") break;
    const m = FM_LINE_RE.exec(line);
    if (!m) return { ok: false, reason: "malformed front-matter line" };
    const key = m[1]!;
    if (fields.has(key)) return { ok: false, reason: `duplicate key ${key}` };
    if (!(RULE_KEYS as readonly string[]).includes(key)) {
      return { ok: false, reason: `unknown key ${key}` };
    }
    fields.set(key, m[2]!);
  }
  for (const k of RULE_KEYS) if (!fields.has(k)) return { ok: false, reason: `missing ${k}` };
  const id = fields.get("id")!;
  const scope = fields.get("scope")!;
  const priorityText = fields.get("priority")!;
  if (!RULE_ID_RE.test(id)) return { ok: false, reason: "invalid id" };
  if (!SCOPES.includes(scope))
    return { ok: false, reason: "invalid scope (all|claude|codex|grok)" };
  if (!PRIORITY_RE.test(priorityText) || Number(priorityText) > 1000) {
    return { ok: false, reason: "invalid priority (integer 0–1000)" };
  }
  const rawBody = pos <= text.length ? text.slice(pos) : "";
  const cleaned = redactSecrets(sanitizePeerText(rawBody), NO_ENV);
  const bodyBytes = Buffer.from(cleaned, "utf8");
  const overCap = bodyBytes.length > RULE_MAX_BYTES;
  const body = overCap ? cutAt(bodyBytes, RULE_MAX_BYTES).toString("utf8") : cleaned;
  return {
    ok: true,
    id,
    scope: scope as RuleScope,
    priority: Number(priorityText),
    body,
    bytes: fileBytes,
    truncated: overCap || readCut,
    empty: cleaned.trim() === "",
  };
}

const strictDecoder = new TextDecoder("utf-8", { fatal: true });

function decodeStrict(buf: Buffer): string | null {
  try {
    return strictDecoder.decode(buf);
  } catch {
    return null;
  }
}

/** Read one user rule file without following a symlink: text or an invalid reason. */
function readUserRule(
  path: string,
): { text: string; size: number; cut: boolean } | { reason: string } {
  let st: ReturnType<typeof lstatSync>;
  try {
    st = lstatSync(path);
  } catch {
    return { reason: "unreadable" };
  }
  if (st.isSymbolicLink()) return { reason: "symlink" };
  if (!st.isFile()) return { reason: "not a regular file" };
  let buf: Buffer;
  let size = 0;
  let cut = false;
  try {
    const fd = openSync(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
    );
    try {
      const fst = fstatSync(fd);
      if (!fst.isFile()) return { reason: "not a regular file" };
      const all = Buffer.alloc(RULE_READ_MAX_BYTES + 1);
      let total = 0;
      while (total < all.length) {
        const n = readSync(fd, all, total, all.length - total, null);
        if (n === 0) break;
        total += n;
      }
      cut = total > RULE_READ_MAX_BYTES;
      buf = cut ? cutAt(all, RULE_READ_MAX_BYTES) : all.subarray(0, total);
      size = Math.max(fst.size, total);
    } finally {
      closeSync(fd);
    }
  } catch (err) {
    return { reason: errCode(err) === "ELOOP" ? "symlink" : "unreadable" };
  }
  const text = decodeStrict(buf);
  return text === null ? { reason: "not UTF-8" } : { text, size, cut };
}

function errCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code?: unknown }).code)
    : undefined;
}

type Candidate = Extract<Parsed, { ok: true }> & { file: string; path: string };

/** Same source, same id → smaller file name kept; the rest recorded as a conflict. */
function dedupe(
  source: RuleSource,
  candidates: readonly Candidate[],
  conflicts: RuleConflict[],
): Candidate[] {
  const byId = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = byId.get(c.id);
    if (list) list.push(c);
    else byId.set(c.id, [c]);
  }
  const out: Candidate[] = [];
  for (const [id, list] of [...byId.entries()].sort(([a], [b]) => cmpCodeUnits(a, b))) {
    list.sort((a, b) => cmpCodeUnits(a.file, b.file));
    out.push(list[0]!);
    if (list.length > 1) {
      conflicts.push({
        source,
        id,
        kept: list[0]!.file,
        dropped: list.slice(1).map((c) => c.file),
      });
    }
  }
  return out;
}

/** Bundled + user rules merged by id (② 규칙 병합 · R12). Pure read. */
export function loadRules(loomDir: string): RulesView {
  if (typeof loomDir !== "string" || !isAbsolute(loomDir)) {
    throw new TypeError("loadRules: loomDir must be an absolute path");
  }
  const invalid: InvalidRuleFile[] = [];
  const conflicts: RuleConflict[] = [];

  const bundledCandidates: Candidate[] = [];
  for (const b of BUNDLED_RULES) {
    const path = `bundled:${b.file}`;
    const p = parseRuleText(b.text, Buffer.byteLength(b.text, "utf8"), false);
    if (p.ok) bundledCandidates.push({ ...p, file: b.file, path });
    else invalid.push({ source: "bundled", file: b.file, path, reason: p.reason });
  }
  const bundled = dedupe("bundled", bundledCandidates, conflicts);

  const userDir = join(loomDir, "rules");
  let userDirState: RulesView["userDirState"] = "absent";
  let scanCapped = false;
  const userCandidates: Candidate[] = [];
  let st: ReturnType<typeof lstatSync> | null = null;
  try {
    st = lstatSync(userDir);
  } catch (err) {
    const code = errCode(err);
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      userDirState = "unsafe";
      invalid.push({ source: "user", file: "rules", path: userDir, reason: "unreadable" });
    }
  }
  if (st) {
    if (st.isSymbolicLink() || !st.isDirectory()) {
      userDirState = "unsafe";
      invalid.push({
        source: "user",
        file: "rules",
        path: userDir,
        reason: "symlink or not a directory",
      });
    } else {
      let names: string[] | null = null;
      try {
        names = readdirSync(userDir);
      } catch {
        userDirState = "unsafe";
        invalid.push({ source: "user", file: "rules", path: userDir, reason: "unreadable" });
      }
      if (names) {
        userDirState = "dir";
        let md = names.filter((n) => n.endsWith(".md")).sort(cmpCodeUnits);
        if (md.length > RULES_USER_SCAN_MAX) {
          scanCapped = true;
          md = md.slice(0, RULES_USER_SCAN_MAX);
        }
        for (const file of md) {
          const path = join(userDir, file);
          if (!RULE_FILE_RE.test(file)) {
            invalid.push({ source: "user", file, path, reason: "invalid file name" });
            continue;
          }
          const r = readUserRule(path);
          if ("reason" in r) {
            invalid.push({ source: "user", file, path, reason: r.reason });
            continue;
          }
          const p = parseRuleText(r.text, r.size, r.cut);
          if (p.ok) userCandidates.push({ ...p, file, path });
          else invalid.push({ source: "user", file, path, reason: p.reason });
        }
      }
    }
  }
  const user = dedupe("user", userCandidates, conflicts);

  const view = (c: Candidate, source: RuleSource, status: RuleStatus): RuleView => ({
    id: c.id,
    scope: c.scope,
    priority: c.priority,
    status,
    source,
    file: c.file,
    path: c.path,
    bytes: c.bytes,
    truncated: c.truncated,
    body: c.body,
  });
  const merged = new Map<string, RuleView>();
  for (const b of bundled) merged.set(b.id, view(b, "bundled", "bundled"));
  let overrides = 0;
  let disabled = 0;
  for (const u of user) {
    let status: RuleStatus;
    if (u.empty) {
      status = "disabled";
      disabled += 1;
    } else if (merged.get(u.id)?.source === "bundled") {
      status = "override";
      overrides += 1;
    } else {
      status = "user";
    }
    merged.set(u.id, view(u, "user", status));
  }
  const rules = [...merged.values()].sort(
    (a, b) => b.priority - a.priority || cmpCodeUnits(a.id, b.id),
  );
  conflicts.sort((a, b) => cmpCodeUnits(a.source, b.source) || cmpCodeUnits(a.id, b.id));

  return {
    rules,
    invalid,
    conflicts,
    counts: {
      bundled: bundled.length,
      user: user.length,
      overrides,
      disabled,
      invalid: invalid.length,
    },
    userDir,
    userDirState,
    scanCapped,
  };
}
