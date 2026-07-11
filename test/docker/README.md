# Docker dry-run harness — Loom install + cross-container join

Validates the **Tier A1 install path** (0.19.0) and the **self-contained invite +
offline handoff** flow on a clean Linux target, using Docker as a single-host
stand-in for two machines.

> **Scope honesty:** this is onboarding/transport **QA**. It is *not* the
> `LOOM_PURPOSE_REVIEW` goal ("≥2 real people on real machines") — same human,
> same host, no demand signal. It removes the "does install.sh actually work on a
> clean OS?" uncertainty that blocked the real dry-run; it does not replace it.

## Prerequisites

- Docker running (tested: 27.4.0, arm64). Base image `ubuntu:24.04`.
- Network access (Bun installer + a `git clone` of pushed `main` for the ready image).

## Run

```bash
bash test/docker/run-all.sh            # A then B
bash test/docker/run-install-test.sh   # A only
bash test/docker/run-join-test.sh      # B only
```

## Images

| Image | Base | Contents | Used by |
|-------|------|----------|---------|
| `loom-test-clean` | `ubuntu:24.04` | curl, git, ca-certificates, **unzip** — **no Bun, no loom** | Test A, Test B peerB (cold install) |
| `loom-test-ready` | `ubuntu:24.04` | Bun (bun.sh) + loom from pushed `main`, linked on PATH | Test B relay + peerA |

Test A clones the **local working copy** via `LOOM_INSTALL_REPO=/host-repo`, so
`scripts/install.sh` edits are testable without pushing. `loom-test-ready` builds
from pushed `main` — rebuild it (`docker build --no-cache -f Dockerfile.ready .`)
after pushing product changes.

## Test A — `run-install-test.sh`

Runs `scripts/install.sh` piped through `bash` (mirrors `curl … | bash`) inside
the clean, Bun-less image.

- **A1** — cold install succeeds; asserts `loom v0.19.x` via the absolute path and
  via a fresh **interactive** shell (the "open a new terminal" path). Exercises
  **M-4** (Bun-from-scratch — the path the macOS smoke never ran). Reports whether
  a non-interactive **login** shell (`bash -lc`) also gets PATH.
- **A2** *(diagnostic)* — no `unzip`: Bun installer expected to fail → flags a
  prerequisite gap.
- **A3** *(diagnostic)* — bare ubuntu (no curl/git): dies at `need_cmd` → documents
  real first-5-minute friction (A2 in the tier list).

## Test B — `run-join-test.sh`

1. **relay** — `loom relay --host 0.0.0.0 --port 7842 --token …` (H-5 satisfied), durable.
2. **peerA** (`ready`) — `room create` → `room invite --link` → blob to a shared volume.
3. **peerB** (`clean`) — **cold install** via `install.sh`, then `loom room join <blob>`
   (one command; relay URL + token ride in the blob). bob then goes offline.
4. **peerA** — `handoff @bob "…"` while bob is offline → durable inbox.
5. **peerB** — bob returns, `loom inbox` → asserts the message arrived.

Proves: install→join stranger journey, self-contained invite (0.18.0), non-loopback
relay + token transport (R19 M-2), durable offline handoff (0.14) — end to end,
across container boundaries.

## Cleanup

`run-join-test.sh` removes its containers/network/tmp on exit. Manual:

```bash
docker rm -f loom-relay loom-peera loom-peerb 2>/dev/null
docker network rm loom-test-net 2>/dev/null
docker image rm loom-test-clean loom-test-ready 2>/dev/null
```
