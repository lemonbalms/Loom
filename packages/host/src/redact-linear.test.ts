import { describe, expect, test } from "bun:test";
import { redactSecrets } from "./redact";

/*
 * Reference: a frozen copy of the pre-P4b redactSecrets pipeline (quadratic
 * URL-userinfo regex). Inputs fed to it stay short so it remains fast.
 */
const MARK = "[REDACTED]";
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

function oldRedactSecrets(text: string): string {
  let out = text.replace(/([a-zA-Z][a-zA-Z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/g, `$1://${MARK}@`);
  for (const shape of KNOWN_SHAPES) out = out.replace(shape, MARK);
  out = out.replace(/\b(Bearer|Basic)\s+\S+/gi, `$1 ${MARK}`);
  out = out.replace(/"([^"\\]*)"(\s*:\s*)"([^"\\]*)"/g, (match, name: string, sep: string) =>
    SENSITIVE_NAME.test(name) ? `"${name}"${sep}"${MARK}"` : match,
  );
  const boundary = "(^|[^A-Za-z0-9_.-])";
  out = out.replace(
    new RegExp(`${boundary}(${NAME})(\\s*=\\s*)([^\\s]+)`, "gi"),
    (_m, pre: string, name: string, sep: string) => `${pre}${name}${sep}${MARK}`,
  );
  out = out.replace(
    new RegExp(`${boundary}(${NAME})(:\\s*)([^\\s]+)`, "gi"),
    (_m, pre: string, name: string, sep: string) => `${pre}${name}${sep}${MARK}`,
  );
  return out;
}

/** mulberry32: small deterministic PRNG so the fuzz corpus is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HAND_CORPUS = [
  "https://u:p@h",
  "git+ssh://u:p@h",
  "1a://u:p@h",
  "9+x.y-z://u:p@h",
  "-a://u:p@h",
  "xxa://u:p@h",
  "http://u@h",
  "http://u:@h",
  "http://:p@h",
  "a://u:p@h b://v:q@i",
  "see https://user:pw@example.com/x and ftp://a:b@c.d/e then http://x@y",
  "line1 https://u:p@h\r\nline2 git+ssh://u:p@h\r\n",
  "ünï https://u:p@h ✓ ftp://ü:p@h 日本 http://u:日本@h",
  "123://u:p@h",
  "+.-://u:p@h",
  "a1+.-a://u:p@h",
  "x.https://u:p@h",
  "x_https://u:p@h",
  "(https://u:p@h)",
  "https://u:p@h@i",
  "https://u:p:q@h",
  "https:///u:p@h",
  "://u:p@h",
  "a:https://u:p@h",
  "https://u:p@https://v:q@h",
  "",
];

const ALPHABET = [
  ..."abcxyzABCXYZ0123456789+.-:/@ ",
  ..."+.-:/@:/@:/@  ",
  "\t",
  "\n",
  "_",
  "é",
  "https",
  "://",
  "u:p@",
];

describe("redactSecrets URL userinfo — exact equivalence with the pre-P4b regex", () => {
  test("hand corpus", () => {
    for (const s of HAND_CORPUS) {
      expect({ s, out: redactSecrets(s, {}) }).toEqual({ s, out: oldRedactSecrets(s) });
    }
  });

  test("seeded fuzz (20k short strings)", () => {
    const next = rng(0x5eed_4b);
    let mismatches = 0;
    let firstMismatch: string | undefined;
    for (let i = 0; i < 20_000; i++) {
      const len = 1 + Math.floor(next() * 40);
      let s = "";
      for (let j = 0; j < len && s.length < 200; j++) {
        s += ALPHABET[Math.floor(next() * ALPHABET.length)];
      }
      if (redactSecrets(s, {}) !== oldRedactSecrets(s)) {
        mismatches++;
        firstMismatch ??= s;
      }
    }
    expect({ mismatches, firstMismatch }).toEqual({ mismatches: 0, firstMismatch: undefined });
  });
});

describe("redactSecrets URL userinfo — linear time", () => {
  test("64 KiB mixed scheme-char run completes < 250 ms", () => {
    const text = "a1+.-".repeat(13000);
    const start = performance.now();
    expect(redactSecrets(text, {})).toBe(text);
    expect(performance.now() - start).toBeLessThan(250);
  });

  test("1 MiB single-letter run completes < 1000 ms", () => {
    const text = "h".repeat(1024 * 1024);
    const start = performance.now();
    expect(redactSecrets(text, {})).toBe(text);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
