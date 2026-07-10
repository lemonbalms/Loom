# Loom desktop (`apps/desktop`)

Thin **Tauri 2** shell for room Status / Peers / Inbox via **sticky host** loopback RPC.

**PLAN:** `docs/PLAN.md` **v0.12.0** (Board via sticky RPC).

## Rules (do not break)

| Rule | Detail |
|------|--------|
| Sticky only | No second WebSocket join from the desktop |
| M-19 | Rust `invoke` → HTTP `127.0.0.1` + Bearer; **token never in webview** |
| M-20 | UI uses `textContent` only for peer strings |
| Board | Via sticky `list_tasks` / `add_task` / `update_task` (same file as CLI) |

## Prerequisites

- `loom` session + `loom host start`
- `cargo` / `rustc` (1.77+)
- Root `bun install` (for `@tauri-apps/cli`)

## Dev

```bash
# headless smoke (no window)
bun run smoke:desktop

# terminal A
bun run loom host start   # after room create/join

# terminal B (from repo root)
bun run desktop
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
