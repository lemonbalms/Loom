/**
 * PLAN 0.24.0 — pure functions for multi-relay bindings (D2/D3/D4/D6).
 * CLI handlers stay thin and delegate here; persistence goes through saveSession only.
 */
import { parseRelayUrl } from "@loom/protocol";
import {
  type LoomSession,
  type RelayBinding,
  topLevelToBinding,
} from "./session-store";

/** True when the session has a top-level room binding (roomId set). R37 L-2. */
export function hasRoomBinding(
  session: LoomSession | null | undefined,
): boolean {
  return Boolean(session?.roomId && session.roomId.length > 0);
}

/** L-1: normalize relay URL via parseRelayUrl().wsUrl for same/different checks. */
export function normalizeRelayWsUrl(url: string): string {
  return parseRelayUrl(url || "").wsUrl;
}

/** L-1: same-relay iff normalized wsUrl strings are equal. No host-alias folding. */
export function isSameRelay(a: string, b: string): boolean {
  return normalizeRelayWsUrl(a) === normalizeRelayWsUrl(b);
}

/** D8-a / L-4: strip any ?token= from a binding URL for display. */
export function stripRelayUrlToken(url: string): string {
  return parseRelayUrl(url || "").wsUrl;
}

function normalizeBindingForCompare(b: RelayBinding): RelayBinding {
  const ep = parseRelayUrl(b.relayUrl || "", { token: b.relayToken });
  return {
    roomId: b.roomId ?? "",
    roomName: b.roomName ?? "",
    inviteCode: b.inviteCode ?? "",
    peerId: b.peerId ?? "",
    peerSecret: b.peerSecret || undefined,
    relayUrl: ep.wsUrl,
    relayToken: b.relayToken || ep.token || undefined,
    updatedAt: b.updatedAt ?? "",
  };
}

/** Full-field equality of two bindings (M-2). */
export function bindingsEqual(a: RelayBinding, b: RelayBinding): boolean {
  const x = normalizeBindingForCompare(a);
  const y = normalizeBindingForCompare(b);
  return (
    x.roomId === y.roomId &&
    x.roomName === y.roomName &&
    x.inviteCode === y.inviteCode &&
    x.peerId === y.peerId &&
    (x.peerSecret || undefined) === (y.peerSecret || undefined) &&
    x.relayUrl === y.relayUrl &&
    (x.relayToken || undefined) === (y.relayToken || undefined) &&
    x.updatedAt === y.updatedAt
  );
}

export type NameAsOk = {
  ok: true;
  session: LoomSession;
  /** false when existing map entry already equal (true no-op). */
  changed: boolean;
};
export type NameAsErr = {
  ok: false;
  error: string;
  existing: RelayBinding;
};
export type NameAsResult = NameAsOk | NameAsErr;

/**
 * M-2: name current top-level binding as `name`.
 * - missing or equal → record (idempotent)
 * - different → fail-closed unless force
 * Does not switch active binding (standalone --as). Combined use names then switches.
 */
export function nameBindingAs(
  session: LoomSession,
  name: string,
  opts?: { force?: boolean },
): NameAsResult {
  const trimmed = name.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "relay name must be non-empty",
      existing: topLevelToBinding(session),
    };
  }
  if (!hasRoomBinding(session)) {
    return {
      ok: false,
      error:
        "No room binding to name. Create or join a room first, then: loom relay use --as <name>",
      existing: topLevelToBinding(session),
    };
  }
  const current = topLevelToBinding(session);
  const existing = session.relays?.[trimmed];
  if (existing && !bindingsEqual(existing, current) && !opts?.force) {
    return {
      ok: false,
      error:
        `relay binding "${trimmed}" already exists and differs from the current session ` +
        `(relayUrl=${stripRelayUrlToken(existing.relayUrl)}, roomName=${existing.roomName}). ` +
        `Pick another name or pass --force to overwrite.`,
      existing,
    };
  }
  if (existing && bindingsEqual(existing, current) && session.relayName === trimmed) {
    // true no-op: already named and content equal
    return { ok: true, session, changed: false };
  }
  const next: LoomSession = {
    ...session,
    relayName: trimmed,
    relays: {
      ...(session.relays ?? {}),
      [trimmed]: current,
    },
  };
  const changed =
    !existing ||
    session.relayName !== trimmed ||
    !bindingsEqual(existing, current);
  return { ok: true, session: next, changed };
}

export type UseRelayOk = {
  ok: true;
  session: LoomSession;
  fromName?: string;
  toName: string;
};
export type UseRelayErr = {
  ok: false;
  error: string;
  available?: string[];
};
export type UseRelayResult = UseRelayOk | UseRelayErr;

/**
 * D2: switch active binding to `targetName`.
 * Optional `as` names the current binding first (M-2), then switches.
 */
export function useRelayBinding(
  session: LoomSession,
  targetName: string,
  opts?: { as?: string; force?: boolean },
): UseRelayResult {
  const target = targetName.trim();
  if (!target) {
    return {
      ok: false,
      error: "Usage: loom relay use <name> [--as <current-name>] [--force]",
    };
  }

  let working = session;

  // Combined --as: name current first, then switch (D2-vi)
  if (opts?.as) {
    const named = nameBindingAs(working, opts.as, { force: opts.force });
    if (!named.ok) return { ok: false, error: named.error };
    working = named.session;
  }

  // D2-i / L-2: stash/name requirements only when top-level binding exists
  if (hasRoomBinding(working)) {
    if (!working.relayName) {
      return {
        ok: false,
        error:
          "Current binding is unnamed. Name it first: loom relay use --as <name>\n" +
          "  Then switch: loom relay use <target>",
      };
    }
    // Stash current top-level under its name (disk-source binding, L-3)
    const stash = topLevelToBinding(working);
    working = {
      ...working,
      relays: {
        ...(working.relays ?? {}),
        [working.relayName]: stash,
      },
    };
  }

  const available = Object.keys(working.relays ?? {}).sort();
  const targetBinding = working.relays?.[target];
  if (!targetBinding) {
    return {
      ok: false,
      error:
        `Unknown relay binding "${target}".` +
        (available.length > 0
          ? ` Available: ${available.join(", ")}`
          : " No named bindings yet — use --relay-name on room create/join or: loom relay use --as <name>"),
      available,
    };
  }

  const promoted = promoteBindingToTopLevel(working, targetBinding, target);
  return {
    ok: true,
    session: promoted,
    fromName: working.relayName,
    toName: target,
  };
}

/** Promote a map entry to top-level active binding (D2-iii). */
export function promoteBindingToTopLevel(
  session: LoomSession,
  binding: RelayBinding,
  name: string,
): LoomSession {
  const ep = parseRelayUrl(binding.relayUrl || "", {
    token: binding.relayToken,
  });
  return {
    ...session,
    roomId: binding.roomId,
    roomName: binding.roomName,
    inviteCode: binding.inviteCode,
    peerId: binding.peerId,
    peerSecret: binding.peerSecret,
    relayUrl: ep.wsUrl,
    relayToken: binding.relayToken || ep.token,
    updatedAt: binding.updatedAt,
    relayName: name,
    relays: {
      ...(session.relays ?? {}),
      [name]: {
        ...binding,
        relayUrl: ep.wsUrl,
        relayToken: binding.relayToken || ep.token,
      },
    },
  };
}

export type CrossRelayGuardOk = { ok: true };
export type CrossRelayGuardErr = { ok: false; error: string };
export type CrossRelayGuardResult = CrossRelayGuardOk | CrossRelayGuardErr;

/**
 * M-1: fail-closed when creating/joining a different relay without --relay-name.
 * Same-relay rejoin and empty profiles pass. Named or unnamed — flag required on cross-relay.
 */
export function guardCrossRelayCreateJoin(
  session: LoomSession | null | undefined,
  targetRelayUrl: string,
  relayNameFlag?: string,
): CrossRelayGuardResult {
  if (!hasRoomBinding(session)) {
    return { ok: true };
  }
  const currentUrl = session!.relayUrl || "";
  if (isSameRelay(currentUrl, targetRelayUrl)) {
    return { ok: true };
  }
  if (relayNameFlag && relayNameFlag.trim().length > 0) {
    return { ok: true };
  }
  const named = Boolean(session!.relayName);
  if (named) {
    return {
      ok: false,
      error:
        `Cross-relay room create/join would overwrite the active binding for ` +
        `"${session!.relayName}" (current ${stripRelayUrlToken(currentUrl)} → ` +
        `${stripRelayUrlToken(targetRelayUrl)}). Pass --relay-name <new-name> to record ` +
        `the new binding under a different name (the old binding is preserved).`,
    };
  }
  return {
    ok: false,
    error:
      `Cross-relay room create/join would overwrite the unnamed active binding ` +
      `(current ${stripRelayUrlToken(currentUrl)} → ${stripRelayUrlToken(targetRelayUrl)}). ` +
      `Name the current binding first: loom relay use --as <name>\n` +
      `  Then create/join with --relay-name <new-name>.`,
  };
}

export type BindingListItem = {
  name: string;
  relayUrl: string;
  roomName: string;
  peerId: string;
  active: boolean;
};

/**
 * D3: list named bindings for display.
 * Full peerId (never truncated). relayToken/peerSecret never included.
 * L-4: strip ?token= from relayUrl before return.
 */
export function listRelayBindings(session: LoomSession): BindingListItem[] {
  const items: BindingListItem[] = [];
  const seen = new Set<string>();
  const relays = session.relays ?? {};
  for (const name of Object.keys(relays).sort()) {
    const b = relays[name]!;
    seen.add(name);
    items.push({
      name,
      relayUrl: stripRelayUrlToken(b.relayUrl),
      roomName: b.roomName,
      peerId: b.peerId,
      active: session.relayName === name,
    });
  }
  // Named active not yet mirrored into map (corrupt/mid-flight) — still show
  if (
    session.relayName &&
    !seen.has(session.relayName) &&
    hasRoomBinding(session)
  ) {
    items.push({
      name: session.relayName,
      relayUrl: stripRelayUrlToken(session.relayUrl),
      roomName: session.roomName,
      peerId: session.peerId,
      active: true,
    });
  }
  return items;
}

/** Format list lines for CLI (no secrets). */
export function formatRelayBindingList(session: LoomSession): string {
  const items = listRelayBindings(session);
  if (items.length === 0) {
    return (
      "relay bindings: (none)\n" +
      "  Tip: loom room create/join --relay-name <name>\n" +
      "       loom relay use --as <name>"
    );
  }
  const lines = [`relay bindings: ${items.length}`];
  for (const it of items) {
    const mark = it.active ? " *" : "  ";
    lines.push(
      `${mark} ${it.name}  ${it.relayUrl}  room=${it.roomName}  peerId=${it.peerId}`,
    );
  }
  lines.push("  (* = active)");
  return lines.join("\n");
}
