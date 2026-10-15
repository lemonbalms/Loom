/**
 * Process start-time identity via `ps -o lstart=` (LC_ALL=C LANG=C TZ=UTC).
 * Shared by headless worker adoption (0.30.0) and the bridge profile lock (PLAN 0.33.0 R8) —
 * one measurement, no second mechanism. Extracted from headless-worker.ts without behaviour change.
 */
import { execFileSync } from "node:child_process";

/** A failed ps observation is unknown, never proof of death. */
export function readProcessLstart(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  try {
    const out = execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" },
    });
    const text = out.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse a C-locale UTC `lstart` string to epoch ms; anything malformed → null. */
export function parseLstart(value: string): number | null {
  const text = value.trim().replace(/\s+/g, " ");
  const parts =
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(
      text,
    );
  if (!parts) return null;
  const month = MONTHS.indexOf(parts[1]!);
  const day = Number(parts[2]),
    hour = Number(parts[3]),
    minute = Number(parts[4]);
  const second = Number(parts[5]),
    year = Number(parts[6]);
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  )
    return null;
  return date.getTime();
}
