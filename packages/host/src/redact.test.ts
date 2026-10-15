import { describe, expect, test } from "bun:test";
import { redactSecrets } from "./redact";

const CLEAN = "Error: ENOENT: no such file or directory, open '/tmp/x/report.md'";

describe("redactSecrets", () => {
  test("redacts NAME=value, NAME: value, and JSON pairs, keeping the name", () => {
    const names = [
      "api_key",
      "apikey",
      "api-key",
      "apiKey",
      "OPENAI_API_KEY",
      "token",
      "LOOM_RELAY_TOKEN",
      "secret",
      "password",
      "passwd",
      "auth",
      "authorization",
      "Authorization",
      "bearer",
      "cookie",
      "session_id",
      "session-id",
      "sessionid",
      "private_key",
      "private-key",
      "credential",
    ];
    for (const name of names) {
      expect(redactSecrets(`${name}=synthetic-secret-123`, {})).toBe(`${name}=[REDACTED]`);
    }
    expect(redactSecrets("password: hunter2xx", {})).toBe("password: [REDACTED]");
    expect(redactSecrets("note password:  hunter2xx tail", {})).toBe(
      "note password:  [REDACTED] tail",
    );
    expect(redactSecrets("OPENAI_API_KEY = synthetic-secret-123", {})).toBe(
      "OPENAI_API_KEY = [REDACTED]",
    );
    expect(redactSecrets('"api_key":"not-a-shape"', {})).toBe('"api_key":"[REDACTED]"');
    expect(redactSecrets('"api_key" : "not-a-shape"', {})).toBe('"api_key" : "[REDACTED]"');
    expect(redactSecrets('prefix "session_id":"abc12345" suffix', {})).toBe(
      'prefix "session_id":"[REDACTED]" suffix',
    );
    expect(
      redactSecrets("API_KEY=synthetic-secret-123 TOKEN=another-secret-456", {}),
    ).toBe("API_KEY=[REDACTED] TOKEN=[REDACTED]");
  });

  test("redacts Bearer and Basic tokens and keeps the scheme", () => {
    expect(redactSecrets("prefix Bearer abcdefgh suffix", {})).toBe(
      "prefix Bearer [REDACTED] suffix",
    );
    expect(redactSecrets("prefix bearer abcdefgh suffix", {})).toBe(
      "prefix bearer [REDACTED] suffix",
    );
    expect(redactSecrets("prefix Basic dXNlcjpwYXNz suffix", {})).toBe(
      "prefix Basic [REDACTED] suffix",
    );
    expect(redactSecrets("prefix basic dXNlcjpwYXNz suffix", {})).toBe(
      "prefix basic [REDACTED] suffix",
    );
    expect(redactSecrets("Bearer", {})).toBe("Bearer");
    expect(redactSecrets("Basic", {})).toBe("Basic");
  });

  test("redacts known token shapes", () => {
    const sk = `sk-${"a".repeat(16)}`;
    const skAnt = `sk-ant-${"b".repeat(8)}`;
    const xai = `xai-${"c".repeat(16)}`;
    const pat = `github_pat_${"e".repeat(20)}`;
    const akia = "AKIAIOSFODNN7EXAMPLE";
    const aiza = `AIza${"f".repeat(30)}`;
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signatureok";
    expect(redactSecrets(`key ${sk} end`, {})).toBe("key [REDACTED] end");
    expect(redactSecrets(`key ${skAnt} end`, {})).toBe("key [REDACTED] end");
    expect(redactSecrets(`key ${xai} end`, {})).toBe("key [REDACTED] end");
    for (const prefix of ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"]) {
      const token = `${prefix}${"d".repeat(20)}`;
      expect(redactSecrets(`x ${token} y`, {})).toBe("x [REDACTED] y");
    }
    expect(redactSecrets(`key ${pat} end`, {})).toBe("key [REDACTED] end");
    expect(redactSecrets(`key ${akia} end`, {})).toBe("key [REDACTED] end");
    expect(redactSecrets(`key ${aiza} end`, {})).toBe("key [REDACTED] end");
    for (const prefix of ["xoxa-", "xoxb-", "xoxp-", "xoxr-"]) {
      const token = `${prefix}${"a".repeat(10)}`;
      expect(redactSecrets(`x ${token} y`, {})).toBe("x [REDACTED] y");
    }
    expect(redactSecrets(`key ${jwt} end`, {})).toBe("key [REDACTED] end");
    expect(redactSecrets(`sk-${"a".repeat(15)}`, {})).toBe(`sk-${"a".repeat(15)}`);
    expect(redactSecrets(`ghp_${"a".repeat(19)}`, {})).toBe(`ghp_${"a".repeat(19)}`);
    expect(redactSecrets("eyJnotajwt", {})).toBe("eyJnotajwt");
  });

  test("redacts URL userinfo and keeps the scheme", () => {
    expect(redactSecrets("connect https://alice:s3cret@example.com/db", {})).toBe(
      "connect https://[REDACTED]@example.com/db",
    );
    expect(redactSecrets("postgres://user:pass@localhost:5432/app", {})).toBe(
      "postgres://[REDACTED]@localhost:5432/app",
    );
    expect(redactSecrets("https://example.com/a", {})).toBe("https://example.com/a");
    expect(redactSecrets("https://user@example.com/a", {})).toBe("https://user@example.com/a");
  });

  test("redacts exact env values whose names look like secrets", () => {
    expect(
      redactSecrets("leaked relaytokenvalue ok", { LOOM_RELAY_TOKEN: "relaytokenvalue" }),
    ).toBe("leaked [REDACTED] ok");
    expect(
      redactSecrets("a relaytokenvalue b relaytokenvalue", {
        LOOM_RELAY_TOKEN: "relaytokenvalue",
      }),
    ).toBe("a [REDACTED] b [REDACTED]");
    expect(redactSecrets("see a+b.c$def!", { TOKEN: "a+b.c$def" })).toBe("see [REDACTED]!");
    expect(
      redactSecrets("abcdefghijklmnop", {
        API_KEY: "abcdefgh",
        TOKEN: "abcdefghijklmnop",
      }),
    ).toBe("[REDACTED]");
    expect(redactSecrets("1234567", { TOKEN: "1234567" })).toBe("1234567");
    expect(redactSecrets("12345678", { TOKEN: "12345678" })).toBe("[REDACTED]");
    expect(redactSecrets("short", { API_KEY: "short" })).toBe("short");
    expect(
      redactSecrets("url https://example.com/a", { LOOM_RELAY_URL: "https://example.com/a" }),
    ).toBe("url https://example.com/a");
    expect(
      redactSecrets("keep /usr/local/bin", { PATH: "/usr/local/bin" }),
    ).toBe("keep /usr/local/bin");
  });

  test("omitted env reads process.env", () => {
    const key = "LOOM_REDACT_UNIT_TOKEN";
    const value = "redact-default-env-sentinel";
    const prev = process.env[key];
    process.env[key] = value;
    try {
      expect(redactSecrets(`seen ${value} here`)).toBe("seen [REDACTED] here");
      expect(redactSecrets(`seen ${value} here`, {})).toBe(`seen ${value} here`);
    } finally {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  });

  test("leaves ordinary words, paths, and short numbers unchanged", () => {
    expect(redactSecrets(CLEAN, {})).toBe(CLEAN);
    expect(redactSecrets(CLEAN)).toBe(CLEAN);
    expect(redactSecrets("the token is missing", {})).toBe("the token is missing");
    expect(redactSecrets("exit 404 at /var/log/app.log", {})).toBe("exit 404 at /var/log/app.log");
    expect(redactSecrets('"path":"/tmp/x/report.md"', {})).toBe('"path":"/tmp/x/report.md"');
  });
});
