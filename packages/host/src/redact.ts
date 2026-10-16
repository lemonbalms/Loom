/**
 * Redact secrets before a stderr line is copied into a card result note.
 * Pure: the same text and env always produce the same string.
 */

const MARK = "[REDACTED]";

/** Substring match against an assignment name or env var name. */
const SENSITIVE_NAME =
  /api[_-]?key|token|secret|passw(?:or)?d|auth(?:orization)?|bearer|cookie|session[_-]?id|private[_-]?key|credential/i;

const NAME =
  "[A-Za-z0-9_.-]*?(?:api[_-]?key|token|secret|passw(?:or)?d|auth(?:orization)?|bearer|cookie|session[_-]?id|private[_-]?key|credential)[A-Za-z0-9_.-]*";

const KNOWN_SHAPES: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /xai-[A-Za-z0-9]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_\w{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /xox[abpr]-[\w-]{10,}/g,
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/g,
];

function redactUrlUserinfo(text: string): string {
  return text.replace(
    /(?<![a-zA-Z0-9+.-])([0-9+.-]*[a-zA-Z][a-zA-Z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/g,
    `$1://${MARK}@`,
  );
}

function redactKnownShapes(text: string): string {
  let out = text;
  for (const shape of KNOWN_SHAPES) {
    out = out.replace(shape, MARK);
  }
  return out;
}

function redactAuthSchemes(text: string): string {
  return text.replace(/\b(Bearer|Basic)\s+\S+/gi, `$1 ${MARK}`);
}

function redactAssignments(text: string): string {
  let out = text.replace(
    /"([^"\\]*)"(\s*:\s*)"([^"\\]*)"/g,
    (match, name: string, sep: string) =>
      SENSITIVE_NAME.test(name) ? `"${name}"${sep}"${MARK}"` : match,
  );
  const boundary = String.raw`(^|[^A-Za-z0-9_.-])`;
  out = out.replace(
    new RegExp(`${boundary}(${NAME})(\\s*=\\s*)([^\\s]+)`, "gi"),
    (_match, pre: string, name: string, sep: string) => `${pre}${name}${sep}${MARK}`,
  );
  out = out.replace(
    new RegExp(`${boundary}(${NAME})(:\\s*)([^\\s]+)`, "gi"),
    (_match, pre: string, name: string, sep: string) => `${pre}${name}${sep}${MARK}`,
  );
  return out;
}

function redactEnvValues(text: string, env: Record<string, string | undefined>): string {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string" || value.length < 8) continue;
    if (!SENSITIVE_NAME.test(name)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  values.sort((a, b) => b.length - a.length);
  let out = text;
  for (const value of values) {
    if (!out.includes(value)) continue;
    out = out
      .split(MARK)
      .map((part) => (part.includes(value) ? part.split(value).join(MARK) : part))
      .join(MARK);
  }
  return out;
}

/** Redact secret assignments, known token shapes, URL userinfo, and env values. */
export function redactSecrets(
  text: string,
  env?: Record<string, string | undefined>,
): string {
  const source = env ?? process.env;
  let out = redactUrlUserinfo(text);
  out = redactKnownShapes(out);
  out = redactAuthSchemes(out);
  out = redactAssignments(out);
  out = redactEnvValues(out, source);
  return out;
}
