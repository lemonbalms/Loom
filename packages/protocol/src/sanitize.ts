/**
 * Allowlist sanitizer for peer-controlled strings before terminal/MCP output.
 * Keeps printable Unicode + \n \t; strips ESC/CSI/OSC, C0/C1, bidi overrides, zero-width.
 */
const STRIP_CODEPOINTS = new Set([
  // bidi overrides / isolates
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, // LRE RLE PDF LRO RLO
  0x2066, 0x2067, 0x2068, 0x2069, // LRI RLI FSI PDI
  // zero-width / word joiner / BOM as invisible
  0x200b, // ZWSP
  0x200c, // ZWNJ
  0x200d, // ZWJ
  0x2060, // WJ
  0xfeff, // BOM / ZWNBSP
  0x00ad, // soft hyphen
]);

export function sanitizePeerText(input: string): string {
  if (!input) return "";
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const ch = input[i]!;

    // ESC — drop full CSI / OSC / other escape sequences first
    if (code === 0x1b) {
      i = skipEscapeSequence(input, i);
      continue;
    }

    // tab, newline
    if (code === 0x09 || code === 0x0a) {
      out += ch;
      continue;
    }
    // skip other C0 controls and DEL
    if (code < 0x20 || code === 0x7f) {
      continue;
    }
    // C1 controls
    if (code >= 0x80 && code <= 0x9f) {
      continue;
    }
    if (STRIP_CODEPOINTS.has(code)) {
      continue;
    }
    out += ch;
  }
  return out;
}

/** Skip from ESC at index i; return last consumed index. */
function skipEscapeSequence(input: string, i: number): number {
  if (i + 1 >= input.length) return i;
  const next = input[i + 1]!;

  // CSI: ESC [ ... final byte @-~
  if (next === "[") {
    let j = i + 2;
    while (j < input.length) {
      const c = input.charCodeAt(j);
      if (c >= 0x40 && c <= 0x7e) return j;
      j++;
    }
    return input.length - 1;
  }

  // OSC: ESC ] ... BEL or ST (ESC \)
  if (next === "]") {
    let j = i + 2;
    while (j < input.length) {
      if (input.charCodeAt(j) === 0x07) return j; // BEL
      if (input[j] === "\x1b" && input[j + 1] === "\\") return j + 1;
      j++;
    }
    return input.length - 1;
  }

  // Other 2-byte escapes (ESC + one char)
  return i + 1;
}

export function sanitizePeerName(input: string): string {
  return sanitizePeerText(input).replace(/[\n\t]+/g, " ").trim() || "anon";
}

/** Deep-sanitize a handoff for MCP/CLI output (defense in depth). M-9: id/from/mode too. */
export function sanitizeHandoffForOutput<
  T extends {
    body: string;
    id?: string;
    fromPeerId?: string;
    mode?: string;
    attachments?: { content: string; label?: string; kind: string }[];
  },
>(handoff: T): T {
  return {
    ...handoff,
    id: handoff.id ? sanitizePeerText(handoff.id).slice(0, 64) : handoff.id,
    fromPeerId: handoff.fromPeerId
      ? sanitizePeerText(handoff.fromPeerId).slice(0, 64)
      : handoff.fromPeerId,
    mode: handoff.mode
      ? sanitizePeerText(handoff.mode).slice(0, 32)
      : handoff.mode,
    body: sanitizePeerText(handoff.body),
    attachments: handoff.attachments?.map((a) => ({
      ...a,
      content: sanitizePeerText(a.content),
      label: a.label ? sanitizePeerText(a.label) : undefined,
    })),
  };
}
