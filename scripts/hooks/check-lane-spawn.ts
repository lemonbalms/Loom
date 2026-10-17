/**
 * PreToolUse Bash speed bump: headless `claude` / `codex exec` must go through
 * `scripts/lane.ts` (which owns every model pin and writes meta.json evidence).
 *
 * Authority: docs/spikes/HEADLESS-LANES-DESIGN.md §5.2 (Bash gate) · §8 P2.
 *
 * Detection model (architect ruling, round 3): split on UNQUOTED `;`, `&`, `|` (covers
 * `&&`, `||`, `|&`, background `&`) and newlines outside heredoc bodies; then classify
 * each segment by TOKEN PRESENCE, not position. Quoted strings are single tokens and
 * never match. Redirection operators and their targets are ignored; `(`, `)` and
 * backticks are token boundaries.
 *   C = a token with basename `claude` · P = `-p` / `--print` / `--print=…`
 *   X = a token with basename `codex`  · E = `exec` or `e` after the codex token
 *   L = a token with basename exactly `bun` and a LATER token whose path ends with
 *       `scripts/lane.ts` (so `cat|grep|bunx … scripts/lane.ts` are not L)
 *   claude-headless = C∧P · claude-any = C · codex-exec = X∧E · codex-any = X · lane = L
 * - Outside a lane: deny a segment with claude-headless or codex-exec, even if it also
 *   has L. A segment with only L (the wrapper call) is allowed.
 * - Inside a lane (`LOOM_LANE` non-empty): deny a segment with claude-any, codex-any or
 *   lane (no nesting — the lane reports back to the architect instead).
 * - `bash|sh|zsh -c '<str>'`: the inner string's segments are classified too (one level).
 * Accepted false-deny: an UNQUOTED mention (`echo claude -p`) is denied; quote the whole phrase.
 *
 * Deny = stderr + exit 2. Unparseable stdin / non-Bash tool / internal error = exit 0
 * (fail-open, same as check-bun-test-env.ts). Runs before rule-router-jit.ts
 * (HANDOFF invariant "Bash deny before JIT").
 *
 * Documented residual: this gate catches habit, not adversaries. `eval`, aliases/variables
 * naming the binary, quoting the binary name itself (`"claude" -p`), scripts that spawn
 * processes themselves, and `bash -c` nested deeper than one level are NOT detected.
 * Also not covered: uncommon shell syntax not covered by the tokenizer (process
 * substitution, brace groups spanning lines, aliases, functions) — the hook is a speed
 * bump; lane.ts evidence (meta.json) is the enforcement.
 * The evidence gate (no lane meta.json → not accepted) is the primary control (§5.1).
 */

export type SpawnKind = "claude-headless" | "claude-any" | "codex-exec" | "codex-any" | "lane";

export type LaneSpawnInput = {
  tool_name?: string;
  tool_input?: { command?: string };
};

export type LaneSpawnDecision = { ok: true } | { ok: false; reason: string };

/**
 * Parse a heredoc delimiter word starting at `start` (after `<<` / `<<-`): optional
 * blanks, then a shell word made of unquoted chars, `'…'`, `"…"` and `\x` escapes.
 * Returns the unquoted/unescaped delimiter and the index just past the word.
 */
function readHeredocWord(command: string, start: number): { delim: string; end: number } | null {
  let j = start;
  while (command[j] === " " || command[j] === "\t") j++;
  let delim = "";
  let any = false;
  while (j < command.length) {
    const c = command[j]!;
    if (c === "'" || c === '"') {
      const close = command.indexOf(c, j + 1);
      if (close < 0) return null;
      delim += command.slice(j + 1, close);
      j = close + 1;
      any = true;
      continue;
    }
    if (c === "\\" && j + 1 < command.length && command[j + 1] !== "\n") {
      delim += command[j + 1]!;
      j += 2;
      any = true;
      continue;
    }
    if (/[\s;|&<>()]/.test(c)) break;
    delim += c;
    j++;
    any = true;
  }
  return any && delim !== "" ? { delim, end: j } : null;
}

/** Split on unquoted `;`, `&`, `|` and newlines (heredoc bodies and comments skipped). */
export function splitSegments(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: "'" | '"' | null = null;
  const pendingHeredocs: { delim: string; stripTabs: boolean }[] = [];
  let i = 0;
  const push = () => {
    const t = cur.trim();
    if (t) out.push(t);
    cur = "";
  };
  while (i < command.length) {
    const ch = command[i]!;
    if (quote) {
      if (ch === "\\" && quote === '"' && i + 1 < command.length) {
        cur += ch + command[i + 1]!;
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      cur += ch;
      i++;
      continue;
    }
    if (ch === "\\" && i + 1 < command.length) {
      // Line continuation joins lines; other escapes are kept verbatim.
      if (command[i + 1] === "\n") {
        cur += " ";
      } else {
        cur += ch + command[i + 1]!;
      }
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      i++;
      continue;
    }
    if (ch === "#" && (cur === "" || /\s$/.test(cur))) {
      // Comment to end of line.
      while (i < command.length && command[i] !== "\n") i++;
      continue;
    }
    if (ch === "<" && command[i + 1] === "<" && command[i + 2] === "<") {
      // Here-string `<<< word`: never a heredoc; the word is lexed normally.
      cur += "<<<";
      i += 3;
      continue;
    }
    if (ch === "<" && command[i + 1] === "<") {
      // Heredoc: record the delimiter; its body (data, not commands) is skipped below.
      const stripTabs = command[i + 2] === "-";
      const word = readHeredocWord(command, i + (stripTabs ? 3 : 2));
      if (word) {
        pendingHeredocs.push({ delim: word.delim, stripTabs });
        cur += command.slice(i, word.end);
        i = word.end;
        continue;
      }
    }
    if (ch === "\n") {
      push();
      i++;
      while (pendingHeredocs.length > 0) {
        const { delim, stripTabs } = pendingHeredocs.shift()!;
        while (i < command.length) {
          const nl = command.indexOf("\n", i);
          const line = nl < 0 ? command.slice(i) : command.slice(i, nl);
          i = nl < 0 ? command.length : nl + 1;
          // Ends only on a line exactly equal to the delimiter; `<<-` strips leading TABs only.
          if ((stripTabs ? line.replace(/^\t+/, "") : line) === delim) break;
        }
      }
      continue;
    }
    const prev = cur[cur.length - 1];
    const redirPart =
      (ch === "|" && prev === ">") ||
      (ch === "&" && (prev === ">" || prev === "<" || command[i + 1] === ">"));
    if (redirPart) {
      cur += ch;
      i++;
      continue;
    }
    if (ch === ";" || ch === "&" || ch === "|") {
      push();
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  push();
  return out;
}

export type Token = { text: string; quoted: boolean; redirect?: true };

/**
 * Shell-word tokenizer: quotes removed, escapes resolved, no expansion. A token that
 * contains any `'…'` / `"…"` part is `quoted` (never matches a binary name). Unquoted
 * `(`, `)` and backticks end a token.
 */
export function tokenize(segment: string): Token[] {
  const words: Token[] = [];
  let cur = "";
  let inWord = false;
  let quoted = false;
  let quote: "'" | '"' | null = null;
  const flush = () => {
    if (inWord) words.push({ text: cur, quoted });
    cur = "";
    inWord = false;
    quoted = false;
  };
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === "\\" && i + 1 < segment.length && /["\\$`]/.test(segment[i + 1]!)) {
        cur += segment[++i]!;
      } else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
      quoted = true;
      continue;
    }
    if (ch === "\\" && i + 1 < segment.length) {
      cur += segment[++i]!;
      inWord = true;
      continue;
    }
    if (/\s/.test(ch) || ch === "(" || ch === ")" || ch === "`") {
      flush();
      continue;
    }
    if (ch === "<" || ch === ">") {
      // Unquoted redirection ends the word (a pure-digit word is its fd, e.g. `2>`).
      if (!quoted && /^\d+$/.test(cur)) {
        cur = "";
        inWord = false;
      } else flush();
      let op = ch;
      while (i + 1 < segment.length && /[<>&|]/.test(segment[i + 1]!)) op += segment[++i]!;
      if (op === "<<" && segment[i + 1] === "-") op += segment[++i]!;
      words.push({ text: op, quoted: false, redirect: true });
      continue;
    }
    cur += ch;
    inWord = true;
  }
  flush();
  return words;
}

function basename(word: string): string {
  const idx = word.lastIndexOf("/");
  return idx >= 0 ? word.slice(idx + 1) : word;
}

/** Command words: redirection operators and their target token are dropped. */
function commandWords(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.redirect) {
      j++; // skip the redirection target
      continue;
    }
    out.push(t);
  }
  return out;
}

/** Shell options that take a separate value argument (skipped while looking for `-c`). */
const SHELL_VALUE_OPTS = new Set(["-o", "+o", "-O", "+O", "--rcfile", "--init-file"]);

const SHELLS = new Set(["bash", "sh", "zsh"]);

function kindsOf(words: Token[]): SpawnKind[] {
  const kinds = new Set<SpawnKind>();
  let codexAt = -1;
  let bunAt = -1;
  for (let j = 0; j < words.length; j++) {
    const w = words[j]!;
    if (w.quoted) continue;
    const name = basename(w.text);
    if (name === "claude") kinds.add("claude-any");
    if (name === "codex") {
      kinds.add("codex-any");
      if (codexAt < 0) codexAt = j;
    }
    if (name === "bun" && bunAt < 0) bunAt = j;
    else if (bunAt >= 0 && (w.text === "scripts/lane.ts" || w.text.endsWith("/scripts/lane.ts"))) {
      kinds.add("lane");
    }
  }
  if (
    kinds.has("claude-any") &&
    words.some(
      (w) =>
        !w.quoted && (w.text === "-p" || w.text === "--print" || w.text.startsWith("--print=")),
    )
  ) {
    kinds.add("claude-headless");
  }
  if (
    codexAt >= 0 &&
    words.some((w, j) => j > codexAt && !w.quoted && (w.text === "exec" || w.text === "e"))
  ) {
    kinds.add("codex-exec");
  }
  return [...kinds];
}

/**
 * Per-leaf classification: the segment itself, plus (depth 0 only) the segments of the
 * inner string of any `bash|sh|zsh -c '<str>'` in it, each as its own leaf.
 */
function classifyLeaves(segment: string, depth: number): SpawnKind[][] {
  const words = commandWords(tokenize(segment));
  const leaves: SpawnKind[][] = [kindsOf(words)];
  if (depth > 0) return leaves;
  for (let j = 0; j < words.length; j++) {
    const w = words[j]!;
    if (w.quoted || !SHELLS.has(basename(w.text))) continue;
    for (let k = j + 1; k < words.length; k++) {
      const a = words[k]!;
      if (!a.quoted && /^-[A-Za-z]*c[A-Za-z]*$/.test(a.text)) {
        const inner = words[k + 1];
        if (inner !== undefined) {
          for (const seg of splitSegments(inner.text))
            leaves.push(...classifyLeaves(seg, depth + 1));
        }
        break;
      }
      if (a.quoted) break;
      if (SHELL_VALUE_OPTS.has(a.text)) {
        k++; // option value
        continue;
      }
      if (!a.text.startsWith("-") && !a.text.startsWith("+")) break; // script / positional: not -c
    }
  }
  return leaves;
}

/** Kinds this segment spawns (union over itself and one level of `bash|sh|zsh -c`). */
export function classifySegment(segment: string): SpawnKind[] {
  const all = new Set<SpawnKind>();
  for (const leaf of classifyLeaves(segment, 0)) for (const k of leaf) all.add(k);
  return [...all];
}

export const DENY_IN_LANE = (lane: string) =>
  `[lane-spawn] inside a lane (LOOM_LANE=${lane}): spawning claude/codex/lane.ts is not allowed — report back to the architect instead. If this only mentions the command, put the whole phrase in quotes.`;

export const DENY_HEADLESS =
  '[lane-spawn] run headless lanes through the wrapper: bun run scripts/lane.ts <impl|advise|verify> --spec <file> (CLAUDE.md rule 8 · HEADLESS-LANES-DESIGN §5.2). If this only mentions the command, put the whole phrase in quotes.';

export function decide(command: string, env: { LOOM_LANE?: string }): LaneSpawnDecision {
  const lane = env.LOOM_LANE;
  const leaves = splitSegments(command).flatMap((seg) => classifyLeaves(seg, 0));
  if (typeof lane === "string" && lane !== "") {
    const hit = leaves.some(
      (k) => k.includes("claude-any") || k.includes("codex-any") || k.includes("lane"),
    );
    return hit ? { ok: false, reason: DENY_IN_LANE(lane) } : { ok: true };
  }
  // No lane exemption: a segment that calls the wrapper AND claude/codex is denied.
  const hit = leaves.some((k) => k.includes("claude-headless") || k.includes("codex-exec"));
  return hit ? { ok: false, reason: DENY_HEADLESS } : { ok: true };
}

async function main(): Promise<void> {
  let input: LaneSpawnInput = {};
  try {
    const raw = await Bun.stdin.text();
    if (raw.trim()) input = JSON.parse(raw) as LaneSpawnInput;
  } catch {
    process.exit(0);
  }

  try {
    const tool = input.tool_name ?? "Bash";
    if (tool && tool !== "Bash") process.exit(0);
    const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
    if (!command) process.exit(0);
    const decision = decide(command, { LOOM_LANE: process.env.LOOM_LANE });
    if (!decision.ok) {
      console.error(`${decision.reason}\nrejected command: ${command.slice(0, 200)}`);
      process.exit(2);
    }
  } catch {
    process.exit(0);
  }
  process.exit(0);
}

if (import.meta.main) {
  void main();
}
