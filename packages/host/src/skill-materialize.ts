/**
 * PLAN 0.31.0 P3. Skill sources, room skills.json, card-dir copy, manifest.
 *
 * D1  selection = the room's local skills.json only; a card payload never picks skills.
 * D2  sources = bundled packages/host/skills/<name>/ + loomDir()/skills/<name>/; user wins.
 * D3  copy (never link) into <card dir>/skills/; files 0600, dirs 0700; manifest sha256.
 * D6  / R49-M5 script = regular file under a scripts/ dir, or any file with an exec bit.
 *     A skill with scripts is copied only when allowScripts names it; its scripts are 0700
 *     and the manifest records them (`scripts`), so the hash covers every file mode.
 * R1  room path = loomDir/rooms/roomKey(roomId)/skills.json.
 * R3  / R49-L3 policy skills.allow: null = all, [] = none.
 * R7  symlink / non-regular source entry → unsafe source; > 1 MiB or > 256 files → too large.
 * R49-L1 description = one line, control/format chars removed, ≤ 160 code points.
 * Unavailable skills are never copied. Writes happen only under the card dir.
 *
 * Path trust: loomDir is realpath'd once (it and everything above it, e.g. HOME, is
 * trusted). Every component below it — rooms/<key>, skills/<name>/…, cards/<peer>/<card>/
 * skills — must be a real directory (lstat, never a symlink) or the operation fails closed.
 * Source file reads use O_NOFOLLOW + fd inode checks + realpath containment.
 * Residual (out of scope): a same-user process swapping directories mid-traversal; it
 * already holds the owner's privileges.
 *
 * Marker lookalikes: descriptions and every raw frontmatter line are checked after NFKC +
 * lowercase + letters/digits only. Accepted Low residual: cross-script homoglyphs (e.g.
 * Cyrillic "е" for Latin "e") are not folded by NFKC and are not caught.
 *
 * Concurrency: materialize swaps the copy with two renames, so a concurrent verify can see
 * no skills dir (→ ok:false → fingerprint_changed, fail closed) and two concurrent
 * materializes make one throw. Callers serialize per card (headless-worker withCardLock,
 * in-process; one bridge per profile is the documented 0.30.0 limit).
 */
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  type FileHandle,
  lstat,
  mkdir,
  open,
  opendir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import loomCardReportSkill from "../skills/loom-card-report/SKILL.md" with { type: "text" };
import loomMemoryCandidatesSkill from "../skills/loom-memory-candidates/SKILL.md" with {
  type: "text",
};
import {
  type CardSessionKey,
  cardKeyHash,
  cardPeerHash,
  cardSessionPath,
} from "./card-session-store";
import type { EffectivePolicy } from "./policy";
import { roomKey } from "./room-event-log";

export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Per skill, total bytes across all files. */
export const SKILL_MAX_BYTES = 1024 * 1024;
/** Per skill, regular files. */
export const SKILL_MAX_FILES = 256;
/** Code points after sanitization. */
export const SKILL_DESCRIPTION_MAX = 160;
export const CARD_SKILLS_PLUGIN_NAME = "loom-card";

/**
 * Frontmatter keys accepted at the top level (anything else → invalid SKILL.md).
 * name/description = Claude skill core; version/license/metadata = common informational
 * keys; allowed-tools/hooks = Claude keys that widen execution (gated like scripts);
 * loom / loom.requires-policy = D6.
 */
export const SKILL_FRONTMATTER_KEYS: readonly string[] = Object.freeze([
  "name",
  "description",
  "version",
  "license",
  "metadata",
  "allowed-tools",
  "hooks",
  "loom",
  "loom.requires-policy",
]);

const SKILLS_JSON_MAX_BYTES = 64 * 1024;
const MANIFEST_MAX_BYTES = 4 * 1024 * 1024;
/** Directory entries walked per skill (files + dirs); bounds a hostile tree. */
const SKILL_MAX_ENTRIES = 1024;
/** Entries read from any single directory before giving up. */
const DIR_MAX_ENTRIES = 512;
const PLUGIN_JSON_TEXT = `${JSON.stringify({ name: CARD_SKILLS_PLUGIN_NAME })}\n`;
/** Letters/digits of the dispatched-task marker head, after NFKC + case folding. */
const MARKER_LETTERS = "loomdispatchedtask";
const GATED_KEYS = new Set(["allowed-tools", "hooks"]);
/** Keys whose value may be a nested block. */
const BLOCK_KEYS = new Set(["allowed-tools", "hooks", "metadata", "loom"]);
const SHA256_HEX = /^[0-9a-f]{64}$/;
/** Any C0/C1/DEL, format (bidi, zero-width, BOM), or line/paragraph separator except LF. */
const RAW_FORBIDDEN = /(?!\n)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const BLOCK_SCALAR = /^[>|][+-]?$/;
/** Nested mapping keys (fail closed on anything YAML could resolve to a non-string). */
const NESTED_KEY = /^[a-z][a-z0-9_-]*$/;
/** Inside `hooks`, event names such as PreToolUse keep their case. */
const HOOKS_NESTED_KEY = /^[A-Za-z][A-Za-z0-9_-]*$/;
/** YAML 1.1/1.2 boolean and null words; rejected as keys in any case. */
const YAML_RESERVED_KEYS = new Set(["true", "false", "yes", "no", "on", "off", "y", "n", "null"]);
const TOP_KEY_LINE = /^([a-z][a-z0-9.-]*):(?: +(.*))?$/;
const NESTED_KEY_LINE = /^([A-Za-z0-9_][A-Za-z0-9_.-]*):(?: +(.*))?$/;

export type SkillSource = "builtin" | "user";

export type BuiltinSkill = {
  name: string;
  /** relPath ("/"-separated) → file text. */
  files: Readonly<Record<string, string>>;
};

/** UK-7: embedded as text so the single-file dist bundle carries it. */
export const BUILTIN_SKILLS: readonly BuiltinSkill[] = Object.freeze([
  { name: "loom-card-report", files: Object.freeze({ "SKILL.md": loomCardReportSkill }) },
  {
    name: "loom-memory-candidates",
    files: Object.freeze({ "SKILL.md": loomMemoryCandidatesSkill }),
  },
]);

/**
 * PLAN 0.38.0 D4 · R56-L2: builtins accepted only via `MaterializeOptions.forced`. Selected by
 * the room alone, such a name resolving to the builtin is `not installed` (0.37 bytes for an
 * unknown name); a user skill of that name still materializes from the room selection.
 */
const FORCED_ONLY_BUILTINS: ReadonlySet<string> = new Set(["loom-memory-candidates"]);

export type SkillManifestEntry = {
  name: string;
  source: SkillSource;
  /** relPath → sha256 hex. */
  files: Record<string, string>;
  /** relPaths copied at 0700 (allowScripts scripts); every other file is 0600. Sorted. */
  scripts: string[];
};

export type SkillUnavailableReason =
  | "not allowed by policy"
  | "not installed"
  | "unsafe source"
  | "too large"
  | "invalid SKILL.md"
  | "bad description"
  | "requires policy";

export type AvailableSkill = {
  name: string;
  source: SkillSource;
  /** Sanitized: one line, no control/format chars, ≤ 160 code points. */
  description: string;
  /** Absolute path of SKILL.md inside the card copy (under the caller's loomDir). */
  skillMdPath: string;
  /**
   * PLAN 0.37.0 D8 · R19: present (true) only for a user skill whose name is also a bundled
   * skill. Listing label only — not in the manifest, so never a fingerprint input.
   */
  shadowsBuiltin?: true;
};

export type UnavailableSkill = { name: string; reason: SkillUnavailableReason };

export type SkillPolicy = EffectivePolicy["skills"];

export type MaterializeOptions = CardSessionKey & {
  /** Bridge config worker.skills.enabled. false → nothing is read or written. */
  enabled: boolean;
  policy: SkillPolicy;
  /**
   * PLAN 0.38.0 D4 · R5: names merged with the room selection (deduped) before the unchanged
   * pipeline (shadowing · policy · manifest). Omitted = 0.37 behaviour.
   */
  forced?: readonly string[];
};

export type MaterializeResult = {
  enabled: boolean;
  /** <card dir>/skills, or null when disabled. */
  skillsDir: string | null;
  /** <card dir>/skills/plugin (claude --plugin-dir), or null when disabled. */
  pluginDir: string | null;
  /** null when disabled. */
  manifest: SkillManifestEntry[] | null;
  /** "" when disabled. */
  manifestHash: string;
  /** Sorted by name. */
  available: AvailableSkill[];
  /** Sorted by name. Only names the room selected. */
  unavailable: UnavailableSkill[];
};

export type VerifyCardSkillsResult =
  | {
      ok: true;
      skillsDir: string;
      pluginDir: string;
      manifest: SkillManifestEntry[];
      manifestHash: string;
    }
  | { ok: false; reason: string };

type LoadedFile = { rel: string; data: Buffer; mode: number };
type Loaded = { ok: true; files: LoadedFile[] } | { ok: false; reason: SkillUnavailableReason };

function errCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function errDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function validRelPath(rel: string): boolean {
  if (rel.length === 0 || rel.includes("\\") || rel.includes("\0")) return false;
  return rel.split("/").every((s) => s.length > 0 && s !== "." && s !== "..");
}

/** D6 / R49-M5. */
function isScript(rel: string, mode: number): boolean {
  return rel.split("/").slice(0, -1).includes("scripts") || (mode & 0o111) !== 0;
}

/** R1: same key and escape guard as the 0.29.0 room event dir. */
export function roomSkillsPath(loomDir: string, roomId: string): string {
  const root = resolve(loomDir);
  const key = roomKey(roomId);
  const dir = resolve(root, "rooms", key);
  if (!/^[0-9a-f]{16}$/.test(key) || !dir.startsWith(root + sep)) {
    throw new Error("room skills path escaped loom dir");
  }
  return join(dir, "skills.json");
}

/** D3 / R2: next to session.json in the card dir. */
export function cardSkillsDir(key: CardSessionKey): string {
  return join(dirname(cardSessionPath(key)), "skills");
}

/** realpath of loomDir (trusted, may itself be a symlink); null when it does not exist. */
async function realLoomDir(loomDir: string): Promise<string | null> {
  let real: string;
  try {
    real = await realpath(loomDir);
  } catch (err) {
    if (errCode(err) === "ENOENT") return null;
    throw err;
  }
  if (!(await lstat(real)).isDirectory()) throw new Error(`loom dir is not a directory: ${real}`);
  return real;
}

/** "missing" | "dir"; anything else (symlink, file, …) throws. */
async function realDirState(path: string): Promise<"missing" | "dir"> {
  let st: Awaited<ReturnType<typeof lstat>>;
  try {
    st = await lstat(path);
  } catch (err) {
    if (errCode(err) === "ENOENT") return "missing";
    throw err;
  }
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw new Error(`unsafe path: ${path} is not a real directory`);
  }
  return "dir";
}

/** Names in a directory, read with an early abort; null when over `cap`. Sorted. */
async function listCapped(path: string, cap: number): Promise<string[] | null> {
  const names: string[] = [];
  for await (const ent of await opendir(path)) {
    names.push(ent.name);
    if (names.length > cap) return null;
  }
  return names.sort(compareCodeUnits);
}

async function readAll(fh: FileHandle, size: number): Promise<Buffer> {
  const buf = Buffer.alloc(size + 1);
  let total = 0;
  while (total < buf.length) {
    const { bytesRead } = await fh.read(buf, total, buf.length - total, null);
    if (bytesRead === 0) break;
    total += bytesRead;
  }
  if (total > size) throw new Error("file grew while reading");
  return buf.subarray(0, total);
}

/** O_NOFOLLOW + O_NONBLOCK; rejects symlinks, non-regular files, and files over max. */
async function readRegularFile(path: string, max: number): Promise<Buffer> {
  const fh = await open(
    path,
    fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | fsConstants.O_NOFOLLOW,
  );
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw new Error("not a regular file");
    if (st.size > max) throw new Error(`size ${st.size} bytes exceeds the ${max}-byte cap`);
    return await readAll(fh, st.size);
  } finally {
    await fh.close();
  }
}

/**
 * D1 / R1. `{version:1, skills:[name…]}`. Absent file (or absent rooms/room dir) → [].
 * A symlinked rooms dir, room dir, or skills.json, and any other failure, throws
 * naming the path (fail closed: the caller does not spawn).
 */
export async function readRoomSkillSelection(loomDir: string, roomId: string): Promise<string[]> {
  const path = roomSkillsPath(loomDir, roomId);
  const bad = (field: string, what: string) =>
    new Error(`invalid skills.json ${path}: ${field} ${what}`);
  let buf: Buffer;
  try {
    const root = await realLoomDir(loomDir);
    if (root === null) return [];
    let cur = root;
    for (const seg of ["rooms", roomKey(roomId)]) {
      cur = join(cur, seg);
      if ((await realDirState(cur)) === "missing") return [];
    }
    buf = await readRegularFile(join(cur, "skills.json"), SKILLS_JSON_MAX_BYTES);
  } catch (err) {
    if (errCode(err) === "ENOENT") return [];
    const detail = errCode(err) === "ELOOP" ? "is a symlink" : errDetail(err);
    throw new Error(`invalid skills.json ${path}: ${detail}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch (err) {
    throw bad("(root)", `JSON parse failed: ${errDetail(err)}`);
  }
  if (!isPlainObject(json)) throw bad("(root)", "must be an object");
  for (const k of Object.keys(json)) {
    if (k !== "version" && k !== "skills") throw bad(k, "is not a known key");
  }
  if (json.version !== 1) throw bad("version", "must be 1");
  if (!Array.isArray(json.skills)) throw bad("skills", "must be an array of skill names");
  const names: string[] = [];
  json.skills.forEach((name, i) => {
    if (typeof name !== "string" || !SKILL_NAME_RE.test(name)) {
      throw bad(`skills[${i}]`, "must match ^[a-z0-9][a-z0-9-]{0,63}$");
    }
    if (!names.includes(name)) names.push(name);
  });
  return names;
}

/** NFKC + lowercase + letters/digits only (marker lookalike check). */
function foldedLetters(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** R49-L1. null = bad description. */
export function sanitizeSkillDescription(raw: string): string | null {
  const text = raw
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length === 0) return null;
  if ([...text].length > SKILL_DESCRIPTION_MAX) return null;
  // Must not forge the system/data boundary, including fullwidth, case, and
  // punctuation lookalikes of the marker head.
  if (foldedLetters(text).includes(MARKER_LETTERS)) return null;
  return text;
}

type Frontmatter = {
  name: string;
  /** undefined = key absent. */
  description?: string;
  requiresPolicy: boolean;
  gated: boolean;
};

/**
 * One scalar of the strict subset. null = outside the subset:
 * flow collections, anchors, aliases, tags, block indicators, directives, reserved
 * starts, `": "` / `" #"` inside a plain scalar, any backslash or `"` inside a
 * double-quoted scalar (no escapes), a lone `'` inside a single-quoted scalar.
 */
function scalar(v: string): string | null {
  if (v === "") return "";
  if (/^[{[&*!|>%@`#?]/.test(v) || /^-( |$)/.test(v)) return null;
  if (v.startsWith('"')) {
    if (v.length < 2 || !v.endsWith('"')) return null;
    const inner = v.slice(1, -1);
    return inner.includes('"') || inner.includes("\\") ? null : inner;
  }
  if (v.startsWith("'")) {
    if (v.length < 2 || !v.endsWith("'")) return null;
    const inner = v.slice(1, -1);
    return inner.replace(/''/g, "").includes("'") ? null : inner.replace(/''/g, "'");
  }
  if (v.includes(": ") || v.endsWith(":") || v.includes(" #")) return null;
  return v.trim();
}

/** Value of loom.requires-policy: anything but an exact `false` requires policy. */
function requiresFrom(value: string): boolean {
  return scalar(value) !== "false";
}

type TopEntry = { value: string; nested: string[]; block?: string[] };

/**
 * Strict line-based subset of YAML frontmatter (see SKILL_FRONTMATTER_KEYS).
 * null = invalid SKILL.md. Raw frontmatter must contain no control (except LF, and CR
 * immediately before LF), format, or separator characters — claude parses these bytes.
 */
function parseFrontmatter(text: string): Frontmatter | null {
  const lines = text.split("\n");
  if (lines[0] !== "---" && lines[0] !== "---\r") return null;
  const body: string[] = [];
  let closed = false;
  for (const rawLine of lines.slice(1)) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "---") {
      closed = true;
      break;
    }
    body.push(line);
  }
  if (!closed) return null;
  for (const line of ["---", ...body]) {
    if (RAW_FORBIDDEN.test(line) || foldedLetters(line).includes(MARKER_LETTERS)) return null;
  }

  const top = new Map<string, TopEntry>();
  let cur: TopEntry | null = null;
  // Active `description: |`/`>` block: every indented or blank line is content, never a comment.
  let block: { indent: number | null; lines: string[] } | null = null;
  for (const line of body) {
    if (block) {
      if (line.trim() === "") {
        block.lines.push("");
        continue;
      }
      if (line.startsWith(" ")) {
        const indent = line.length - line.trimStart().length;
        if (block.indent === null) block.indent = indent;
        else if (indent < block.indent) return null;
        block.lines.push(line.slice(block.indent));
        continue;
      }
      block = null; // a column-0 line ends the block scalar
    }
    if (line.trim() === "" || /^ *#/.test(line)) continue;
    if (line === "..." || line.startsWith("%")) return null;
    if (line.startsWith(" ")) {
      if (!cur) return null;
      cur.nested.push(line);
      continue;
    }
    const m = TOP_KEY_LINE.exec(line);
    if (!m || !SKILL_FRONTMATTER_KEYS.includes(m[1]!) || top.has(m[1]!)) return null;
    cur = { value: (m[2] ?? "").trimEnd(), nested: [] };
    top.set(m[1]!, cur);
    if (m[1] === "description" && BLOCK_SCALAR.test(cur.value)) {
      block = { indent: null, lines: [] };
      cur.block = block.lines;
    }
  }

  const fm: Frontmatter = { name: "", requiresPolicy: false, gated: false };
  for (const [key, entry] of top) {
    if (GATED_KEYS.has(key)) fm.gated = true;
    if (entry.block) {
      // Folded to one line (YAML folds `>`; R49-L1 makes `|` one line too).
      fm.description = entry.block
        .map((l) => l.trim())
        .filter((l) => l !== "")
        .join(" ");
      continue;
    }
    if (entry.nested.length > 0) {
      if (entry.value !== "" || !BLOCK_KEYS.has(key)) return null;
      // Mapping scopes by key column; a duplicate key in any scope is invalid.
      const scopes: { col: number; keys: Set<string> }[] = [];
      for (const raw of entry.nested) {
        let item = raw.trimStart();
        let col = raw.length - item.length;
        let listItem = false;
        let dashCol = col;
        while (item === "-" || item.startsWith("- ")) {
          listItem = true;
          dashCol = col;
          const rest = item.slice(1);
          item = rest.trimStart();
          col += 1 + rest.length - item.length;
        }
        // A bare `-` is anchored at its dash: trailing spaces never move its scope.
        if (listItem && item === "") col = dashCol + 1;
        // A list item (bare `-` included) closes every scope at or right of its content.
        while (
          scopes.length > 0 &&
          (listItem ? scopes.at(-1)!.col >= col : scopes.at(-1)!.col > col)
        ) {
          scopes.pop();
        }
        if (item === "") continue;
        const kv = NESTED_KEY_LINE.exec(item);
        if (kv) {
          if (scalar((kv[2] ?? "").trimEnd()) === null) return null;
          // Plain identifiers only, so literal spelling = YAML key identity (no 1/01,
          // true/True); hooks event names keep their case and compare case-insensitively.
          const hooks = key === "hooks";
          if (!(hooks ? HOOKS_NESTED_KEY : NESTED_KEY).test(kv[1]!)) return null;
          if (YAML_RESERVED_KEYS.has(kv[1]!.toLowerCase())) return null;
          const keyId = hooks ? kv[1]!.toLowerCase() : kv[1]!;
          if (scopes.length === 0 || scopes.at(-1)!.col < col)
            scopes.push({ col, keys: new Set() });
          const scope = scopes.at(-1)!;
          if (scope.keys.has(keyId)) return null;
          scope.keys.add(keyId);
          if (key === "loom") {
            if (listItem || kv[1] !== "requires-policy") return null;
            if (requiresFrom((kv[2] ?? "").trimEnd())) fm.requiresPolicy = true;
          }
        } else if (!listItem || scalar(item) === null || key === "loom") {
          return null;
        }
        // Fail safe: a requires-policy mention anywhere else (e.g. metadata) counts.
        if (key !== "loom" && item.includes("requires-policy")) fm.requiresPolicy = true;
      }
      continue;
    }
    const value = scalar(entry.value);
    if (value === null) return null;
    if (key === "loom") {
      if (value !== "") return null;
    } else if (key === "loom.requires-policy") {
      if (requiresFrom(entry.value)) fm.requiresPolicy = true;
    } else if (key === "name") {
      fm.name = value;
    } else if (key === "description") {
      fm.description = value;
    }
  }
  return fm;
}

async function loadUserSkill(skillsRoot: string, name: string): Promise<Loaded> {
  const unsafe: Loaded = { ok: false, reason: "unsafe source" };
  const tooLarge: Loaded = { ok: false, reason: "too large" };
  const dir = join(skillsRoot, name);
  try {
    if ((await realDirState(dir)) !== "dir") return unsafe;
  } catch {
    return unsafe;
  }
  const found: { rel: string; ino: number; dev: number }[] = [];
  let entries = 0;
  let bytes = 0;
  const stack = [""];
  while (stack.length > 0) {
    const relDir = stack.pop()!;
    let names: string[] | null;
    try {
      names = await listCapped(
        relDir ? join(dir, relDir) : dir,
        Math.min(DIR_MAX_ENTRIES, SKILL_MAX_ENTRIES - entries),
      );
    } catch {
      return unsafe;
    }
    if (names === null) return tooLarge;
    for (const entryName of names) {
      entries += 1;
      if (entries > SKILL_MAX_ENTRIES) return tooLarge;
      const rel = relDir ? `${relDir}/${entryName}` : entryName;
      let st: Awaited<ReturnType<typeof lstat>>;
      try {
        st = await lstat(join(dir, rel));
      } catch {
        return unsafe;
      }
      if (st.isSymbolicLink()) return unsafe;
      if (st.isDirectory()) {
        stack.push(rel);
        continue;
      }
      if (!st.isFile() || !validRelPath(rel)) return unsafe;
      found.push({ rel, ino: st.ino, dev: st.dev });
      bytes += st.size;
      if (found.length > SKILL_MAX_FILES || bytes > SKILL_MAX_BYTES) return tooLarge;
    }
  }
  const files: LoadedFile[] = [];
  let total = 0;
  for (const f of found) {
    const abs = join(dir, f.rel);
    try {
      // Containment: every component is a real dir, so the canonical path is the path.
      if ((await realpath(abs)) !== abs) return unsafe;
    } catch {
      return unsafe;
    }
    let fh: FileHandle;
    try {
      fh = await open(abs, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
    } catch {
      return unsafe;
    }
    try {
      const st = await fh.stat();
      if (!st.isFile() || st.ino !== f.ino || st.dev !== f.dev) return unsafe;
      if (total + st.size > SKILL_MAX_BYTES) return tooLarge;
      const data = await readAll(fh, st.size);
      total += data.length;
      files.push({ rel: f.rel, data, mode: st.mode & 0o777 });
    } catch {
      return unsafe;
    } finally {
      await fh.close();
    }
  }
  return { ok: true, files };
}

function loadBuiltinSkill(skill: BuiltinSkill): Loaded {
  const files: LoadedFile[] = [];
  let total = 0;
  for (const [rel, text] of Object.entries(skill.files)) {
    if (!validRelPath(rel)) return { ok: false, reason: "unsafe source" };
    const data = Buffer.from(text, "utf8");
    total += data.length;
    files.push({ rel, data, mode: 0o644 });
  }
  if (files.length > SKILL_MAX_FILES || total > SKILL_MAX_BYTES) {
    return { ok: false, reason: "too large" };
  }
  return { ok: true, files };
}

type Accepted = { name: string; source: SkillSource; description: string; files: LoadedFile[] };

function evaluate(
  name: string,
  source: SkillSource,
  files: LoadedFile[],
  policy: SkillPolicy,
): Accepted | SkillUnavailableReason {
  const skillMd = files.find((f) => f.rel === "SKILL.md");
  if (!skillMd) return "invalid SKILL.md";
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(skillMd.data);
  } catch {
    return "invalid SKILL.md";
  }
  const fm = parseFrontmatter(text);
  if (!fm || fm.name !== name) return "invalid SKILL.md";
  const description =
    fm.description === undefined ? null : sanitizeSkillDescription(fm.description);
  if (description === null) return "bad description";
  const needsPolicy = fm.requiresPolicy || fm.gated || files.some((f) => isScript(f.rel, f.mode));
  if (needsPolicy && !policy.allowScripts.includes(name)) return "requires policy";
  return { name, source, description, files };
}

function canonicalManifest(manifest: readonly SkillManifestEntry[]): SkillManifestEntry[] {
  return [...manifest]
    .sort((a, b) => compareCodeUnits(a.name, b.name))
    .map((e) => ({
      name: e.name,
      source: e.source,
      files: Object.fromEntries(Object.entries(e.files).sort(([a], [b]) => compareCodeUnits(a, b))),
      scripts: [...e.scripts].sort(compareCodeUnits),
    }));
}

function manifestFileText(manifest: readonly SkillManifestEntry[]): string {
  return `${JSON.stringify(canonicalManifest(manifest), null, 2)}\n`;
}

/** D11 / R49-M3. sha256 of the canonical manifest; skills disabled (null) → "". */
export function skillsManifestHash(manifest: readonly SkillManifestEntry[] | null): string {
  if (manifest === null) return "";
  return sha256Hex(JSON.stringify(canonicalManifest(manifest)));
}

async function mkdirPrivate(path: string): Promise<void> {
  await mkdir(path, { mode: 0o700 });
  await chmod(path, 0o700);
}

async function writePrivate(path: string, data: Buffer | string, mode: number): Promise<void> {
  await writeFile(path, data, { mode, flag: "wx" });
  await chmod(path, mode);
}

type UserRoot = "absent" | "dir" | "unsafe";

async function userRootState(path: string): Promise<UserRoot> {
  try {
    return (await realDirState(path)) === "dir" ? "dir" : "absent";
  } catch {
    return "unsafe";
  }
}

async function resolveSkill(
  name: string,
  userRoot: string,
  rootState: UserRoot,
): Promise<{ source: SkillSource; loaded: Loaded } | null> {
  if (rootState === "unsafe") {
    return { source: "user", loaded: { ok: false, reason: "unsafe source" } };
  }
  if (rootState === "dir") {
    try {
      await lstat(join(userRoot, name));
      return { source: "user", loaded: await loadUserSkill(userRoot, name) };
    } catch (err) {
      if (errCode(err) !== "ENOENT") {
        return { source: "user", loaded: { ok: false, reason: "unsafe source" } };
      }
    }
  }
  const builtin = BUILTIN_SKILLS.find((s) => s.name === name);
  return builtin ? { source: "builtin", loaded: loadBuiltinSkill(builtin) } : null;
}

/** PLAN 0.35.0 R15. `unknown` = no valid policy to judge by (policy.json invalid). */
export type SkillAvailability = "available" | "unavailable" | "unknown";

export type SkillInventoryItem = {
  name: string;
  /** Same rule as resolveSkill: a user entry wins whenever it exists, even broken. */
  source: SkillSource;
  /** A user entry hides the bundled skill of the same name. */
  shadowsBuiltin: boolean;
  status: SkillAvailability;
  /** Set when status is "unavailable". */
  reason: SkillUnavailableReason | null;
  /** Sanitized SKILL.md description when it parses, else null. */
  description: string | null;
};

export type SkillInventory = {
  /** Builtin names ∪ valid user entry names, sorted by name. */
  skills: SkillInventoryItem[];
  /** User skills-dir entries whose name fails SKILL_NAME_RE, sorted. */
  ignored: string[];
  userRoot: "absent" | "dir" | "unsafe";
};

/**
 * PLAN 0.35.0 D7 / R15 (`loom skills list`). Read-only inventory of every installed skill —
 * builtin and `<loomDir>/skills/<name>` — with source and shadowing resolved exactly as
 * materializeCardSkills does (resolveSkill), and availability judged by the same
 * loadUserSkill / loadBuiltinSkill / evaluate path. `policy` null = availability unknown.
 * Never copies, creates or writes anything; never throws on file content.
 */
export async function inventorySkills(
  loomDir: string,
  policy: SkillPolicy | null,
): Promise<SkillInventory> {
  let userRoot = "";
  let rootState: UserRoot = "absent";
  try {
    const root = await realLoomDir(loomDir);
    if (root !== null) {
      userRoot = join(root, "skills");
      rootState = await userRootState(userRoot);
    }
  } catch {
    rootState = "unsafe";
  }

  const builtinNames = new Set(BUILTIN_SKILLS.map((s) => s.name));
  const names = new Set(builtinNames);
  const ignored: string[] = [];
  if (rootState === "dir") {
    let entries: string[] | null = null;
    try {
      entries = await listCapped(userRoot, DIR_MAX_ENTRIES);
    } catch {
      entries = null;
    }
    for (const entry of entries ?? []) {
      if (SKILL_NAME_RE.test(entry)) names.add(entry);
      else ignored.push(entry);
    }
  }

  const skills: SkillInventoryItem[] = [];
  for (const name of [...names].sort(compareCodeUnits)) {
    const found = await resolveSkill(name, userRoot, rootState);
    if (!found) {
      // The user entry vanished between listing and resolving.
      skills.push({
        name,
        source: "user",
        shadowsBuiltin: false,
        status: "unavailable",
        reason: "not installed",
        description: null,
      });
      continue;
    }
    const item: SkillInventoryItem = {
      name,
      source: found.source,
      shadowsBuiltin: found.source === "user" && builtinNames.has(name),
      status: "available",
      reason: null,
      description: null,
    };
    if (policy !== null && policy.allow !== null && !policy.allow.includes(name)) {
      item.status = "unavailable";
      item.reason = "not allowed by policy";
    } else if (!found.loaded.ok) {
      item.status = policy === null ? "unknown" : "unavailable";
      item.reason = policy === null ? null : found.loaded.reason;
    } else {
      const judge: SkillPolicy = policy ?? { allow: null, allowScripts: [name] };
      const verdict = evaluate(name, found.source, found.loaded.files, judge);
      if (typeof verdict === "string") {
        item.status = policy === null ? "unknown" : "unavailable";
        item.reason = policy === null ? null : verdict;
      } else {
        item.description = verdict.description;
        if (policy === null) item.status = "unknown";
      }
    }
    skills.push(item);
  }
  return { skills, ignored: ignored.sort(compareCodeUnits), userRoot: rootState };
}

function cardChain(key: CardSessionKey): string[] {
  return ["cards", cardPeerHash(key.localPeerId), cardKeyHash(key.roomId, key.agent, key.cardId)];
}

/** Creates cards/<peer>/<card> under the real loom dir; every component must be a real dir. */
async function ensureCardDir(root: string, key: CardSessionKey): Promise<string> {
  let cur = root;
  for (const seg of cardChain(key)) {
    cur = join(cur, seg);
    if ((await realDirState(cur)) === "missing") {
      try {
        await mkdir(cur, { mode: 0o700 });
      } catch (err) {
        if (errCode(err) !== "EEXIST") throw err;
      }
      if ((await realDirState(cur)) !== "dir") throw new Error(`card dir vanished: ${cur}`);
    }
  }
  return cur;
}

/**
 * D1–D3 · D6 · R1 · R3 · R7. Reads the room's skills.json, resolves each selected
 * name (user over builtin), validates it, and copies the available ones into
 * <card dir>/skills/ (replacing any earlier copy). Throws on an invalid
 * skills.json, an unsafe (symlinked) card-dir path, or a write failure; nothing
 * outside the card dir is written. Callers serialize per card (see header).
 */
export async function materializeCardSkills(opts: MaterializeOptions): Promise<MaterializeResult> {
  if (!opts.enabled) {
    return {
      enabled: false,
      skillsDir: null,
      pluginDir: null,
      manifest: null,
      manifestHash: "",
      available: [],
      unavailable: [],
    };
  }
  const key: CardSessionKey = {
    loomDir: opts.loomDir,
    localPeerId: opts.localPeerId,
    roomId: opts.roomId,
    agent: opts.agent,
    cardId: opts.cardId,
  };
  const forced = new Set(opts.forced ?? []);
  const selected = new Set([...(await readRoomSkillSelection(key.loomDir, key.roomId)), ...forced]);
  let root = await realLoomDir(key.loomDir);
  if (root === null) {
    await mkdir(key.loomDir, { recursive: true, mode: 0o700 });
    root = await realLoomDir(key.loomDir);
    if (root === null) throw new Error(`loom dir vanished: ${key.loomDir}`);
  }
  const allow = opts.policy.allow === null ? null : new Set(opts.policy.allow);
  const userRoot = join(root, "skills");
  const rootState = await userRootState(userRoot);

  const accepted: Accepted[] = [];
  const unavailable: UnavailableSkill[] = [];
  for (const name of [...selected].sort(compareCodeUnits)) {
    if (allow !== null && !allow.has(name)) {
      unavailable.push({ name, reason: "not allowed by policy" });
      continue;
    }
    const found = await resolveSkill(name, userRoot, rootState);
    if (
      !found ||
      (found.source === "builtin" && FORCED_ONLY_BUILTINS.has(name) && !forced.has(name))
    ) {
      unavailable.push({ name, reason: "not installed" });
      continue;
    }
    if (!found.loaded.ok) {
      unavailable.push({ name, reason: found.loaded.reason });
      continue;
    }
    const verdict = evaluate(name, found.source, found.loaded.files, opts.policy);
    if (typeof verdict === "string") unavailable.push({ name, reason: verdict });
    else accepted.push(verdict);
  }

  const cardDir = await ensureCardDir(root, key);
  const realSkillsDir = join(cardDir, "skills");
  const previousState = await realDirState(realSkillsDir);
  await chmod(cardDir, 0o700);
  const staging = join(cardDir, `.skills.tmp.${process.pid}.${randomUUID()}`);
  const manifest: SkillManifestEntry[] = [];
  try {
    await mkdirPrivate(staging);
    await mkdirPrivate(join(staging, "plugin"));
    await mkdirPrivate(join(staging, "plugin", ".claude-plugin"));
    await writePrivate(
      join(staging, "plugin", ".claude-plugin", "plugin.json"),
      PLUGIN_JSON_TEXT,
      0o600,
    );
    await mkdirPrivate(join(staging, "plugin", "skills"));
    for (const skill of accepted) {
      const base = join(staging, "plugin", "skills", skill.name);
      await mkdirPrivate(base);
      const made = new Set<string>();
      const files: Record<string, string> = Object.create(null);
      const scripts: string[] = [];
      for (const f of [...skill.files].sort((a, b) => compareCodeUnits(a.rel, b.rel))) {
        const segs = f.rel.split("/");
        for (let i = 1; i < segs.length; i++) {
          const sub = segs.slice(0, i).join("/");
          if (made.has(sub)) continue;
          await mkdirPrivate(join(base, sub));
          made.add(sub);
        }
        // Only allowScripts skills reach here with scripts (evaluate gate).
        const script = isScript(f.rel, f.mode);
        await writePrivate(join(base, f.rel), f.data, script ? 0o700 : 0o600);
        files[f.rel] = sha256Hex(f.data);
        if (script) scripts.push(f.rel);
      }
      manifest.push({ name: skill.name, source: skill.source, files, scripts });
    }
    await writePrivate(join(staging, "manifest.json"), manifestFileText(manifest), 0o600);

    const previous =
      previousState === "dir" ? join(cardDir, `.skills.old.${process.pid}.${randomUUID()}`) : null;
    if (previous) await rename(realSkillsDir, previous);
    await rename(staging, realSkillsDir);
    if (previous) await rm(previous, { recursive: true, force: true });
  } catch (err) {
    await rm(staging, { recursive: true, force: true });
    throw err;
  }

  const skillsDir = cardSkillsDir(key);
  const pluginDir = join(skillsDir, "plugin");
  const canonical = canonicalManifest(manifest);
  return {
    enabled: true,
    skillsDir,
    pluginDir,
    manifest: canonical,
    manifestHash: skillsManifestHash(canonical),
    available: accepted.map((s) => ({
      name: s.name,
      source: s.source,
      description: s.description,
      skillMdPath: join(pluginDir, "skills", s.name, "SKILL.md"),
      ...(s.source === "user" && BUILTIN_SKILLS.some((b) => b.name === s.name)
        ? { shadowsBuiltin: true as const }
        : {}),
    })),
    unavailable,
  };
}

function parseManifest(raw: unknown): SkillManifestEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: SkillManifestEntry[] = [];
  for (const e of raw) {
    if (!isPlainObject(e)) return null;
    if (Object.keys(e).sort().join(",") !== "files,name,scripts,source") return null;
    const { name, source, files, scripts } = e;
    if (typeof name !== "string" || !SKILL_NAME_RE.test(name) || seen.has(name)) return null;
    if (source !== "builtin" && source !== "user") return null;
    if (!isPlainObject(files) || !Object.hasOwn(files, "SKILL.md")) return null;
    const entryFiles: Record<string, string> = Object.create(null);
    for (const [rel, h] of Object.entries(files)) {
      if (!validRelPath(rel) || typeof h !== "string" || !SHA256_HEX.test(h)) return null;
      entryFiles[rel] = h;
    }
    if (Object.keys(entryFiles).length > SKILL_MAX_FILES) return null;
    if (!Array.isArray(scripts)) return null;
    const entryScripts: string[] = [];
    for (const rel of scripts) {
      if (typeof rel !== "string" || !Object.hasOwn(entryFiles, rel)) return null;
      if (entryScripts.includes(rel)) return null;
      entryScripts.push(rel);
    }
    seen.add(name);
    out.push({ name, source, files: entryFiles, scripts: entryScripts });
  }
  return out;
}

async function entriesOf(dir: string, cap = SKILL_MAX_ENTRIES): Promise<string[]> {
  const names = await listCapped(dir, cap);
  if (names === null) throw new Error(`too many entries in ${dir}`);
  return names;
}

async function isPrivateDir(path: string): Promise<boolean> {
  const st = await lstat(path);
  return st.isDirectory() && (st.mode & 0o777) === 0o700;
}

async function isPrivateFile(path: string, mode: number): Promise<boolean> {
  const st = await lstat(path);
  return st.isFile() && (st.mode & 0o777) === mode;
}

/** Re-hashes one skill's copy against its manifest entry. null = match. */
async function verifySkillCopy(dir: string, entry: SkillManifestEntry): Promise<string | null> {
  const wantFiles = Object.keys(entry.files);
  const wantDirs = new Set<string>();
  for (const rel of wantFiles) {
    const segs = rel.split("/");
    for (let i = 1; i < segs.length; i++) wantDirs.add(segs.slice(0, i).join("/"));
  }
  const seenFiles: string[] = [];
  const seenDirs: string[] = [];
  let entries = 0;
  let total = 0;
  const stack = [""];
  while (stack.length > 0) {
    const relDir = stack.pop()!;
    const names = await entriesOf(
      relDir ? join(dir, relDir) : dir,
      Math.min(DIR_MAX_ENTRIES, SKILL_MAX_ENTRIES - entries),
    );
    for (const name of names) {
      entries += 1;
      if (entries > SKILL_MAX_ENTRIES) return `${entry.name}: too many entries`;
      const rel = relDir ? `${relDir}/${name}` : name;
      const st = await lstat(join(dir, rel));
      if (st.isDirectory()) {
        if ((st.mode & 0o777) !== 0o700) return `${entry.name}/${rel}: dir mode`;
        seenDirs.push(rel);
        stack.push(rel);
        continue;
      }
      if (!st.isFile()) return `${entry.name}/${rel}: not a regular file`;
      if (!Object.hasOwn(entry.files, rel)) return `${entry.name}/${rel}: not in manifest`;
      const wantMode = entry.scripts.includes(rel) ? 0o700 : 0o600;
      if ((st.mode & 0o777) !== wantMode) return `${entry.name}/${rel}: file mode`;
      total += st.size;
      if (total > SKILL_MAX_BYTES) return `${entry.name}: too large`;
      const data = await readRegularFile(join(dir, rel), SKILL_MAX_BYTES);
      if (sha256Hex(data) !== entry.files[rel]) return `${entry.name}/${rel}: sha256 mismatch`;
      seenFiles.push(rel);
    }
  }
  if (seenFiles.length !== wantFiles.length) return `${entry.name}: missing files`;
  if (seenDirs.length !== wantDirs.size || seenDirs.some((d) => !wantDirs.has(d))) {
    return `${entry.name}: unexpected directories`;
  }
  return null;
}

/**
 * D3 / R49-M3 resume check. Re-hashes the card copy (contents and modes) against its
 * manifest.json without reading any skill source. Every component from the real loom
 * dir down to skills/ must be a real directory. ok:false → the caller treats it as
 * fingerprint_changed. ok:true → manifestHash for the fingerprint (compare it too).
 */
export async function verifyCardSkillsCopy(key: CardSessionKey): Promise<VerifyCardSkillsResult> {
  const fail = (reason: string): VerifyCardSkillsResult => ({ ok: false, reason });
  try {
    const root = await realLoomDir(key.loomDir);
    if (root === null) return fail("loom dir missing");
    let cur = root;
    for (const seg of [...cardChain(key), "skills"]) {
      cur = join(cur, seg);
      if ((await realDirState(cur)) === "missing") return fail(`missing ${cur}`);
    }
    const skillsDir = cur;
    if (!(await isPrivateDir(skillsDir))) return fail("skills dir not 0700");
    if ((await entriesOf(skillsDir, 8)).join("\0") !== ["manifest.json", "plugin"].join("\0")) {
      return fail("unexpected entries in skills dir");
    }
    const manifestPath = join(skillsDir, "manifest.json");
    if (!(await isPrivateFile(manifestPath, 0o600))) return fail("manifest.json mode");
    const text = (await readRegularFile(manifestPath, MANIFEST_MAX_BYTES)).toString("utf8");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail("manifest.json is not JSON");
    }
    const manifest = parseManifest(raw);
    if (!manifest) return fail("manifest.json is invalid");
    if (manifestFileText(manifest) !== text) return fail("manifest.json is not canonical");

    const pluginDir = join(skillsDir, "plugin");
    if (!(await isPrivateDir(pluginDir))) return fail("plugin dir mode");
    if ((await entriesOf(pluginDir, 8)).join("\0") !== [".claude-plugin", "skills"].join("\0")) {
      return fail("unexpected entries in plugin dir");
    }
    const metaDir = join(pluginDir, ".claude-plugin");
    if (!(await isPrivateDir(metaDir))) return fail(".claude-plugin dir mode");
    if ((await entriesOf(metaDir, 8)).join("\0") !== "plugin.json") {
      return fail("unexpected entries in .claude-plugin");
    }
    const pluginJsonPath = join(metaDir, "plugin.json");
    if (!(await isPrivateFile(pluginJsonPath, 0o600))) return fail("plugin.json mode");
    const pluginJson = await readRegularFile(pluginJsonPath, 4096);
    if (pluginJson.toString("utf8") !== PLUGIN_JSON_TEXT) return fail("plugin.json changed");

    const skillsRoot = join(pluginDir, "skills");
    if (!(await isPrivateDir(skillsRoot))) return fail("plugin skills dir mode");
    const names = manifest.map((m) => m.name).sort(compareCodeUnits);
    if ((await entriesOf(skillsRoot)).join("\0") !== names.join("\0")) {
      return fail("skill dirs differ from manifest");
    }
    for (const entry of manifest) {
      const dir = join(skillsRoot, entry.name);
      if (!(await isPrivateDir(dir))) return fail(`${entry.name}: dir mode`);
      const problem = await verifySkillCopy(dir, entry);
      if (problem) return fail(problem);
    }
    const callerSkillsDir = cardSkillsDir(key);
    return {
      ok: true,
      skillsDir: callerSkillsDir,
      pluginDir: join(callerSkillsDir, "plugin"),
      manifest,
      manifestHash: skillsManifestHash(manifest),
    };
  } catch (err) {
    return fail(errDetail(err));
  }
}
