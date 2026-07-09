# Loom desktop (`apps/desktop`)

Thin **Tauri 2** shell for room Status / Peers / Inbox via **sticky host** loopback RPC.

**PLAN:** `docs/PLAN.md` **v0.11.1** (locks) · **Implemented as of 0.11.2**.

## Rules (do not break)

| Rule | Detail |
|------|--------|
| Sticky only | No second WebSocket join from the desktop |
| M-19 | Rust `invoke` → HTTP `127.0.0.1` + Bearer; **token never in webview** |
| M-20 | UI uses `textContent` only for peer strings |
| M-18 C | **No Board** in v1 |

## Prerequisites

- `loom` session + `loom host start`
- `cargo` / `rustc` (1.77+)
- Root `bun install` (for `@tauri-apps/cli`)

## Dev

```bash
# terminal A
bun run loom host start   # after room create/join

# terminal B (from repo root)
bun run desktop
# or: cd apps/desktop && bunx tauri dev
```

Env (same as CLI):

- `LOOM_SESSION` — absolute session JSON path  
- `LOOM_PROFILE` — profile name under `~/.loom/profiles/`  

## Test (Rust)

```bash
cd apps/desktop/src-tauri && cargo test
```

## Layout

```
apps/desktop/
  ui/                 # static HTML/CSS/JS (withGlobalTauri)
  src-tauri/          # Rust commands + sticky client
  README.md
```
