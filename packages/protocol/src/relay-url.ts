import { DEFAULT_RELAY_HOST, DEFAULT_RELAY_PORT } from "./envelope";

export type RelayEndpoint = {
  /** WebSocket URL including path, e.g. ws://127.0.0.1:7842/ws — never embeds token (H-6) */
  wsUrl: string;
  /** HTTP origin for health checks, e.g. http://127.0.0.1:7842 */
  httpOrigin: string;
  host: string;
  port: number;
  /** true when pointing at loopback (may auto-start local daemon) */
  isLocal: boolean;
  /** optional shared secret for remote relay (pass via Authorization header) */
  token?: string;
};

/**
 * Parse relay URL from env/flag.
 * Accepts:
 * - ws://host:port
 * - wss://host:port
 * - http(s)://host:port (converted to ws/wss)
 * - host:port
 * - bare host (default port 7842)
 *
 * If the input URL contains ?token=, it is extracted into `token` and stripped
 * from `wsUrl` so secrets are not kept in the URL string (H-6).
 */
export function parseRelayUrl(
  input: string,
  opts?: { token?: string },
): RelayEndpoint {
  let raw = input.trim();
  if (!raw) {
    return defaultLocalEndpoint(opts?.token);
  }

  // host:port without scheme
  if (!/^[a-z]+:\/\//i.test(raw)) {
    raw = `ws://${raw}`;
  }

  // http(s) → ws(s)
  if (raw.startsWith("http://")) raw = "ws://" + raw.slice("http://".length);
  if (raw.startsWith("https://")) raw = "wss://" + raw.slice("https://".length);

  const u = new URL(raw);
  const host = u.hostname || DEFAULT_RELAY_HOST;
  const port = u.port
    ? Number(u.port)
    : u.protocol === "wss:"
      ? 443
      : DEFAULT_RELAY_PORT;
  const token =
    opts?.token || u.searchParams.get("token") || undefined;

  const path = u.pathname && u.pathname !== "/" ? u.pathname : "/ws";
  const wsUrl = buildWsUrl({
    secure: u.protocol === "wss:",
    host,
    port,
    path,
  });
  const httpOrigin = `${u.protocol === "wss:" ? "https" : "http"}://${host}${port === 80 || port === 443 ? "" : `:${port}`}`;
  const isLocal =
    host === "127.0.0.1" || host === "localhost" || host === "::1";

  return { wsUrl, httpOrigin, host, port, isLocal, token };
}

export function defaultLocalEndpoint(token?: string): RelayEndpoint {
  return parseRelayUrl(
    `ws://${DEFAULT_RELAY_HOST}:${DEFAULT_RELAY_PORT}/ws`,
    { token },
  );
}

export function buildWsUrl(opts: {
  secure?: boolean;
  host: string;
  port: number;
  path?: string;
  /**
   * @deprecated Prefer Authorization: Bearer on the client (H-6).
   * Only set when tokenInQuery is true (legacy / proxy that cannot forward headers).
   */
  token?: string;
  /** When true and token set, append ?token= (fallback only). Default false. */
  tokenInQuery?: boolean;
}): string {
  const scheme = opts.secure ? "wss" : "ws";
  const path = opts.path || "/ws";
  const portPart =
    (opts.secure && opts.port === 443) || (!opts.secure && opts.port === 80)
      ? ""
      : `:${opts.port}`;
  let url = `${scheme}://${opts.host}${portPart}${path.startsWith("/") ? path : `/${path}`}`;
  if (opts.tokenInQuery && opts.token) {
    const sep = url.includes("?") ? "&" : "?";
    url += `${sep}token=${encodeURIComponent(opts.token)}`;
  }
  return url;
}

/** Resolve from env: LOOM_RELAY_URL / FABLE_* dual-read, optional flag override. */
export function resolveRelayEndpoint(opts?: {
  relayFlag?: string;
  tokenFlag?: string;
}): RelayEndpoint {
  // lazy import avoid circular; inline dual-read
  const token =
    opts?.tokenFlag ||
    process.env.LOOM_RELAY_TOKEN ||
    process.env.FABLE_RELAY_TOKEN ||
    undefined;
  const flag =
    opts?.relayFlag ||
    process.env.LOOM_RELAY_URL ||
    process.env.FABLE_RELAY_URL;
  if (flag) return parseRelayUrl(flag, { token });
  return defaultLocalEndpoint(token);
}
