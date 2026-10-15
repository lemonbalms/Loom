/**
 * PLAN 0.31.0 P3. Skill sources, room skills.json, card-dir copy, manifest.
 *
 * D1  selection = the room's local skills.json only; a card payload never picks skills.
 * D2  sources = bundled packages/host/skills/<name>/ + loomDir()/skills/<name>/; user wins.
 * D3  copy (never link) into <card dir>/skills/; files 0600, dirs 0700; manifest sha256.
 * D6  / R49-M5 script = regular file under a scripts/ dir, or any file with an exec bit.
 *     A skill with scripts is copied only when allowScripts names it; its scripts are 0700.
 * R1  room path = loomDir/rooms/roomKey(roomId)/skills.json.
 * R3  / R49-L3 policy skills.allow: null = all, [] = none.
 * R7  symlink / non-regular source entry → unsafe source; > 1 MiB or > 256 files → too large.
 * R49-L1 description = one line, control/format chars removed, ≤ 160 code points.
 * Unavailable skills are never copied. Writes happen only under the card dir.
 */
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  type FileHandle,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { DISPATCHED_TASK_MARKER } from "@loom/protocol";
import loomCardReportSkill from "../skills/loom-card-report/SKILL.md" with { type: "text" };
import { type CardSessionKey, cardSessionPath } from "./card-session-store";
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

const SKILLS_JSON_MAX_BYTES = 64 * 1024;
const MANIFEST_MAX_BYTES = 4 * 1024 * 1024;
/** Directory entries walked per skill (files + dirs); bounds a hostile tree. */
const SKILL_MAX_ENTRIES = 1024;
const PLUGIN_JSON_TEXT = `${JSON.stringify({ name: CARD_SKILLS_PLUGIN_NAME })}\n`;
const MARKER_HEAD = "loom dispatched task";
/** Frontmatter keys that widen what a skill can run; gated like scripts. */
const GATED_KEYS = new Set(["allowed-tools", "allowed_tools", "allowedtools", "hooks"]);
const SHA256_HEX = /^[0-9a-f]{64}$/;

export type SkillSource = "builtin" | "user";

export type BuiltinSkill = {
  name: string;
  /** relPath ("/"-separated) → file text. */
  files: Readonly<Record<string, string>>;
};

/** UK-7: embedded as text so the single-file dist bundle carries it. */
export const BUILTIN_SKILLS: readonly BuiltinSkill[] = Object.freeze([
  { name: "loom-card-report", files: Object.freeze({ "SKILL.md": loomCardReportSkill }) },
]);

export type SkillManifestEntry = {
  name: string;
  source: SkillSource;
  /** relPath → sha256 hex. */
  files: Record<string, string>;
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
  /** Absolute path of SKILL.md inside the card copy. */
  skillMdPath: string;
};

export type UnavailableSkill = { name: string; reason: SkillUnavailableReason };

export type SkillPolicy = EffectivePolicy["skills"];

export type MaterializeOptions = CardSessionKey & {
  /** Bridge config worker.skills.enabled. false → nothing is read or written. */
  enabled: boolean;
  policy: SkillPolicy;
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

/** Opens without blocking on special files; rejects non-regular files and files over max. */
async function readRegularFile(path: string, max: number, follow: boolean): Promise<Buffer> {
  const flags =
    fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | (follow ? 0 : fsConstants.O_NOFOLLOW);
  const fh = await open(path, flags);
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
 * D1 / R1. `{version:1, skills:[name…]}`. Absent file → [] (no skills).
 * Any other failure throws naming the path (fail closed: the caller does not spawn).
 */
export async function readRoomSkillSelection(loomDir: string, roomId: string): Promise<string[]> {
  const path = roomSkillsPath(loomDir, roomId);
  let buf: Buffer;
  try {
    buf = await readRegularFile(path, SKILLS_JSON_MAX_BYTES, true);
  } catch (err) {
    if (errCode(err) === "ENOENT") return [];
    throw new Error(`invalid skills.json ${path}: ${errDetail(err)}`);
  }
  const bad = (field: string, what: string) =>
    new Error(`invalid skills.json ${path}: ${field} ${what}`);
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

/** R49-L1. null = bad description. */
export function sanitizeSkillDescription(raw: string): string | null {
  const text = raw
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length === 0) return null;
  if ([...text].length > SKILL_DESCRIPTION_MAX) return null;
  // A description must not forge the boundary between system text and card data.
  if (text.toLowerCase().includes(MARKER_HEAD) || text.includes(DISPATCHED_TASK_MARKER)) {
    return null;
  }
  return text;
}

type Frontmatter = {
  name?: string;
  description?: string;
  requiresPolicy: boolean;
  gated: boolean;
};

type FrontmatterEntry = { value: string; cont: string[] };

function scalar(entry: FrontmatterEntry): string {
  if (/^[>|][+-]?$/.test(entry.value)) return entry.cont.join(" ");
  let v = [entry.value, ...entry.cont].join(" ").trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) v = v.slice(1, -1);
  return v;
}

function truthy(v: string): boolean {
  return v.trim().toLowerCase() !== "false";
}

/**
 * Line-based subset of YAML frontmatter: top-level `key: value`, indented
 * continuation / nested lines belong to the previous key. null = malformed.
 */
function parseFrontmatter(text: string): Frontmatter | null {
  const lines = (text.startsWith("\uFEFF") ? text.slice(1) : text).split(/\r?\n/);
  if (lines[0]?.trimEnd() !== "---") return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === "---");
  if (end < 0) return null;
  const top = new Map<string, FrontmatterEntry>();
  let cur: FrontmatterEntry | null = null;
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    if (/^\s/.test(line)) {
      if (!cur) return null;
      cur.cont.push(line.trim());
      continue;
    }
    if (line.startsWith("#")) continue;
    const m = /^([A-Za-z0-9_.-]+):(?:[ \t]+(.*))?$/.exec(line);
    if (!m) return null;
    const key = m[1]!.toLowerCase();
    if (top.has(key)) return null;
    cur = { value: (m[2] ?? "").trim(), cont: [] };
    top.set(key, cur);
  }
  const fm: Frontmatter = { requiresPolicy: false, gated: false };
  const name = top.get("name");
  if (name) fm.name = scalar(name);
  const description = top.get("description");
  if (description) fm.description = scalar(description);
  const flat = top.get("loom.requires-policy");
  if (flat && truthy(scalar(flat))) fm.requiresPolicy = true;
  for (const line of top.get("loom")?.cont ?? []) {
    const nested = /^requires-policy\s*:\s*(.*)$/.exec(line);
    if (nested && truthy(nested[1]!.replace(/^(["'])(.*)\1$/, "$2"))) fm.requiresPolicy = true;
  }
  for (const key of top.keys()) if (GATED_KEYS.has(key)) fm.gated = true;
  return fm;
}

async function loadUserSkill(dir: string): Promise<Loaded> {
  const unsafe: Loaded = { ok: false, reason: "unsafe source" };
  const tooLarge: Loaded = { ok: false, reason: "too large" };
  try {
    if (!(await lstat(dir)).isDirectory()) return unsafe;
  } catch {
    return unsafe;
  }
  const found: { rel: string; ino: number; dev: number }[] = [];
  let entries = 0;
  let bytes = 0;
  const stack = [""];
  while (stack.length > 0) {
    const relDir = stack.pop()!;
    let names: string[];
    try {
      names = await readdir(relDir ? join(dir, relDir) : dir);
    } catch {
      return unsafe;
    }
    for (const name of names.sort(compareCodeUnits)) {
      entries += 1;
      if (entries > SKILL_MAX_ENTRIES) return tooLarge;
      const rel = relDir ? `${relDir}/${name}` : name;
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
    let fh: FileHandle;
    try {
      fh = await open(
        join(dir, f.rel),
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
      );
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
    text = new TextDecoder("utf-8", { fatal: true }).decode(skillMd.data);
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
    return (await lstat(path)).isDirectory() ? "dir" : "unsafe";
  } catch (err) {
    return errCode(err) === "ENOENT" ? "absent" : "unsafe";
  }
}

async function resolveSkill(
  name: string,
  userRoot: string,
  rootState: UserRoot,
): Promise<{ source: SkillSource; loaded: Loaded } | null> {
  if (rootState === "unsafe")
    return { source: "user", loaded: { ok: false, reason: "unsafe source" } };
  if (rootState === "dir") {
    const dir = join(userRoot, name);
    try {
      await lstat(dir);
      return { source: "user", loaded: await loadUserSkill(dir) };
    } catch (err) {
      if (errCode(err) !== "ENOENT") {
        return { source: "user", loaded: { ok: false, reason: "unsafe source" } };
      }
    }
  }
  const builtin = BUILTIN_SKILLS.find((s) => s.name === name);
  return builtin ? { source: "builtin", loaded: loadBuiltinSkill(builtin) } : null;
}

/**
 * D1–D3 · D6 · R1 · R3 · R7. Reads the room's skills.json, resolves each selected
 * name (user over builtin), validates it, and copies the available ones into
 * <card dir>/skills/ (replacing any earlier copy). Throws on an invalid
 * skills.json or a write failure; nothing outside the card dir is written.
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
  const selected = await readRoomSkillSelection(key.loomDir, key.roomId);
  const allow = opts.policy.allow === null ? null : new Set(opts.policy.allow);
  const userRoot = join(key.loomDir, "skills");
  const rootState = await userRootState(userRoot);

  const accepted: Accepted[] = [];
  const unavailable: UnavailableSkill[] = [];
  for (const name of [...selected].sort(compareCodeUnits)) {
    if (allow !== null && !allow.has(name)) {
      unavailable.push({ name, reason: "not allowed by policy" });
      continue;
    }
    const found = await resolveSkill(name, userRoot, rootState);
    if (!found) {
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

  const skillsDir = cardSkillsDir(key);
  const cardDir = dirname(skillsDir);
  const pluginDir = join(skillsDir, "plugin");
  await mkdir(cardDir, { recursive: true, mode: 0o700 });
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
      for (const f of [...skill.files].sort((a, b) => compareCodeUnits(a.rel, b.rel))) {
        const segs = f.rel.split("/");
        for (let i = 1; i < segs.length; i++) {
          const sub = segs.slice(0, i).join("/");
          if (made.has(sub)) continue;
          await mkdirPrivate(join(base, sub));
          made.add(sub);
        }
        // Only allowScripts skills reach here with scripts (evaluate gate).
        await writePrivate(join(base, f.rel), f.data, isScript(f.rel, f.mode) ? 0o700 : 0o600);
        files[f.rel] = sha256Hex(f.data);
      }
      manifest.push({ name: skill.name, source: skill.source, files });
    }
    await writePrivate(join(staging, "manifest.json"), manifestFileText(manifest), 0o600);

    let previous: string | null = null;
    try {
      await lstat(skillsDir);
      previous = join(cardDir, `.skills.old.${process.pid}.${randomUUID()}`);
    } catch (err) {
      if (errCode(err) !== "ENOENT") throw err;
    }
    if (previous) await rename(skillsDir, previous);
    await rename(staging, skillsDir);
    if (previous) await rm(previous, { recursive: true, force: true });
  } catch (err) {
    await rm(staging, { recursive: true, force: true });
    throw err;
  }

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
    const keys = Object.keys(e).sort();
    if (keys.join(",") !== "files,name,source") return null;
    const { name, source, files } = e;
    if (typeof name !== "string" || !SKILL_NAME_RE.test(name) || seen.has(name)) return null;
    if (source !== "builtin" && source !== "user") return null;
    if (!isPlainObject(files) || !Object.hasOwn(files, "SKILL.md")) return null;
    const entryFiles: Record<string, string> = Object.create(null);
    for (const [rel, h] of Object.entries(files)) {
      if (!validRelPath(rel) || typeof h !== "string" || !SHA256_HEX.test(h)) return null;
      entryFiles[rel] = h;
    }
    if (Object.keys(entryFiles).length > SKILL_MAX_FILES) return null;
    seen.add(name);
    out.push({ name, source, files: entryFiles });
  }
  return out;
}

async function entriesOf(dir: string): Promise<string[]> {
  return (await readdir(dir)).sort(compareCodeUnits);
}

async function isPrivateDir(path: string): Promise<boolean> {
  const st = await lstat(path);
  return st.isDirectory() && (st.mode & 0o777) === 0o700;
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
    for (const name of await entriesOf(relDir ? join(dir, relDir) : dir)) {
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
      const mode = st.mode & 0o777;
      if (mode !== 0o600 && mode !== 0o700) return `${entry.name}/${rel}: file mode`;
      const want = entry.files[rel];
      if (want === undefined || !Object.hasOwn(entry.files, rel)) {
        return `${entry.name}/${rel}: not in manifest`;
      }
      total += st.size;
      if (total > SKILL_MAX_BYTES) return `${entry.name}: too large`;
      const data = await readRegularFile(join(dir, rel), SKILL_MAX_BYTES, false);
      if (sha256Hex(data) !== want) return `${entry.name}/${rel}: sha256 mismatch`;
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
 * D3 / R49-M3 resume check. Re-hashes the card copy against its manifest.json
 * without reading any skill source. ok:false → the caller treats it as
 * fingerprint_changed. ok:true → manifestHash for the fingerprint.
 */
export async function verifyCardSkillsCopy(skillsDir: string): Promise<VerifyCardSkillsResult> {
  const fail = (reason: string): VerifyCardSkillsResult => ({ ok: false, reason });
  try {
    if (!(await isPrivateDir(skillsDir))) return fail("skills dir missing or not 0700");
    if ((await entriesOf(skillsDir)).join("\0") !== ["manifest.json", "plugin"].join("\0")) {
      return fail("unexpected entries in skills dir");
    }
    const manifestPath = join(skillsDir, "manifest.json");
    const text = (await readRegularFile(manifestPath, MANIFEST_MAX_BYTES, false)).toString("utf8");
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
    if ((await entriesOf(pluginDir)).join("\0") !== [".claude-plugin", "skills"].join("\0")) {
      return fail("unexpected entries in plugin dir");
    }
    const metaDir = join(pluginDir, ".claude-plugin");
    if (!(await isPrivateDir(metaDir))) return fail(".claude-plugin dir mode");
    if ((await entriesOf(metaDir)).join("\0") !== "plugin.json") {
      return fail("unexpected entries in .claude-plugin");
    }
    const pluginJsonPath = join(metaDir, "plugin.json");
    if (((await lstat(pluginJsonPath)).mode & 0o777) !== 0o600) return fail("plugin.json mode");
    const pluginJson = await readRegularFile(pluginJsonPath, 4096, false);
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
    return {
      ok: true,
      skillsDir,
      pluginDir,
      manifest,
      manifestHash: skillsManifestHash(manifest),
    };
  } catch (err) {
    return fail(errDetail(err));
  }
}
