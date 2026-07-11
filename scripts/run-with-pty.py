#!/usr/bin/env python3
"""
Spawn a command in a real PTY and keep its window size in sync with the
controlling terminal (SIGWINCH + poll fallback).

Why Loom needs this:
  - Bun→Bun TUI (Claude Code) crashes with broken inherited stdio.
  - macOS `script(1)` opens a PTY but often freezes rows/cols at start.
  - When Loom (parent) is the foreground process, SIGWINCH may hit the
    parent only — so we poll TIOCGWINSZ and push size into the PTY master.

Usage:
  python3 scripts/run-with-pty.py <command> [args...]
"""
from __future__ import annotations

import errno
import fcntl
import json
import os
import pty
import select
import signal
import socket
import struct
import sys
import termios
import threading
import time
import tty


def _get_winsize(fd: int) -> tuple[int, int, int, int]:
    try:
        raw = fcntl.ioctl(fd, termios.TIOCGWINSZ, b"\x00" * 8)
        rows, cols, hp, wp = struct.unpack("HHHH", raw)
        if rows <= 0:
            rows = 24
        if cols <= 0:
            cols = 80
        return rows, cols, hp, wp
    except Exception:
        return 24, 80, 0, 0


def _set_winsize(fd: int, rows: int, cols: int, hp: int = 0, wp: int = 0) -> None:
    try:
        fcntl.ioctl(
            fd,
            termios.TIOCSWINSZ,
            struct.pack("HHHH", rows, cols, hp, wp),
        )
    except Exception:
        pass


def _safe_unlink(path: str | None) -> None:
    if not path:
        return
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
    except Exception:
        pass


def _peer_uid(conn: socket.socket) -> int | None:
    try:
        if hasattr(socket, "SO_PEERCRED"):
            raw = conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
            _pid, uid, _gid = struct.unpack("3i", raw)
            return uid
    except Exception:
        return None
    try:
        if hasattr(socket, "LOCAL_PEERCRED"):
            raw = conn.getsockopt(socket.SOL_SOCKET, socket.LOCAL_PEERCRED, 12)
            _version, uid, _ngroups = struct.unpack("Iih", raw[:10])
            return uid
    except Exception:
        return None
    return None


def _setup_inject_server(socket_path: str | None, marker_path: str | None) -> socket.socket | None:
    if not socket_path or not marker_path:
        return None
    if not os.path.isabs(socket_path) or not os.path.isabs(marker_path):
        return None
    try:
        os.makedirs(os.path.dirname(socket_path), mode=0o700, exist_ok=True)
        os.makedirs(os.path.dirname(marker_path), mode=0o700, exist_ok=True)
    except Exception:
        return None

    _safe_unlink(socket_path)
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    old_umask = os.umask(0o177)
    try:
        srv.bind(socket_path)
    except Exception:
        os.umask(old_umask)
        srv.close()
        return None
    finally:
        try:
            os.umask(old_umask)
        except Exception:
            pass
    try:
        os.chmod(socket_path, 0o600)
    except Exception:
        srv.close()
        _safe_unlink(socket_path)
        return None
    srv.listen(4)
    srv.setblocking(False)
    return srv


def _handle_inject_conn(
    conn: socket.socket,
    master_fd: int,
    marker_path: str,
    injected_ids: set[str],
    last_output_ns: int,
) -> None:
    def reply(ok: bool, reason: str | None = None) -> None:
        try:
            payload: dict[str, object] = {"ok": ok}
            if reason:
                payload["reason"] = reason
            conn.sendall((json.dumps(payload) + "\n").encode("utf-8"))
        except Exception:
            pass

    try:
        uid = _peer_uid(conn)
        if uid is not None and uid != os.getuid():
            reply(False, "wrong_uid")
            return

        chunks: list[bytes] = []
        total = 0
        conn.settimeout(0.05)
        while total < 1024 * 1024:
            try:
                chunk = conn.recv(8192)
            except socket.timeout:
                break
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if b"\n" in chunk:
                break
        raw = b"".join(chunks).split(b"\n", 1)[0]
        msg = json.loads(raw.decode("utf-8"))
        if not isinstance(msg, dict):
            reply(False, "bad_request")
            return
        handoff_id = msg.get("id")
        text = msg.get("text")
        if not isinstance(handoff_id, str) or not isinstance(text, str):
            reply(False, "bad_request")
            return

        if handoff_id in injected_ids:
            reply(False, "duplicate")
            return

        # Fail-safe: no fresh Stop-hook marker, or recent PTY output, means busy
        # or unknown. Never queue/retry for later delivery.
        try:
            marker = os.stat(marker_path)
        except OSError:
            reply(False, "busy_or_unknown")
            return
        if time.time() - marker.st_mtime > 30.0:
            reply(False, "busy_or_unknown")
            return
        quiet_for = (time.monotonic_ns() - last_output_ns) / 1_000_000_000
        if quiet_for < 0.3:
            reply(False, "busy_or_unknown")
            return

        safe_text = text.rstrip("\r\n")
        frame = f"\x1b[200~{safe_text}\x1b[201~"
        os.write(master_fd, frame.encode("utf-8"))
        injected_ids.add(handoff_id)
        reply(True)
    except Exception:
        reply(False, "error")
    finally:
        try:
            conn.close()
        except Exception:
            pass


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("usage: run-with-pty.py <command> [args...]\n")
        return 2

    cmd = sys.argv[1:]
    stdin_fd = 0
    stdout_fd = 1

    # Open PTY
    master_fd, slave_fd = pty.openpty()

    # Match parent terminal size before fork
    rows, cols, hp, wp = _get_winsize(stdin_fd)
    _set_winsize(slave_fd, rows, cols, hp, wp)
    _set_winsize(master_fd, rows, cols, hp, wp)

    pid = os.fork()
    if pid == 0:
        # Child: become session leader, slave as controlling tty
        try:
            os.setsid()
        except OSError:
            pass
        try:
            fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
        except OSError:
            pass
        os.dup2(slave_fd, 0)
        os.dup2(slave_fd, 1)
        os.dup2(slave_fd, 2)
        if slave_fd > 2:
            os.close(slave_fd)
        os.close(master_fd)
        os.environ["LINES"] = str(rows)
        os.environ["COLUMNS"] = str(cols)
        os.environ["TERM"] = os.environ.get("TERM") or "xterm-256color"
        try:
            os.execvp(cmd[0], cmd)
        except OSError as e:
            sys.stderr.write(f"exec failed: {e}\n")
            os._exit(127)

    # Parent
    os.close(slave_fd)
    last_size = (rows, cols)
    last_output_ns = time.monotonic_ns()
    injected_ids: set[str] = set()
    inject_socket_path = os.environ.get("LOOM_INJECT_SOCKET")
    inject_marker_path = os.environ.get("LOOM_INJECT_IDLE_MARKER")
    inject_server = _setup_inject_server(inject_socket_path, inject_marker_path)

    def apply_size(force: bool = False) -> None:
        nonlocal last_size
        r, c, h, w = _get_winsize(stdin_fd)
        if not force and (r, c) == last_size:
            return
        last_size = (r, c)
        _set_winsize(master_fd, r, c, h, w)
        os.environ["LINES"] = str(r)
        os.environ["COLUMNS"] = str(c)
        try:
            os.kill(pid, signal.SIGWINCH)
        except ProcessLookupError:
            pass

    def on_winch(_signum: int, _frame: object) -> None:
        apply_size(force=True)

    try:
        signal.signal(signal.SIGWINCH, on_winch)
    except Exception:
        pass

    stop = threading.Event()

    def poll_size() -> None:
        # Fallback when parent Loom keeps SIGWINCH and never delivers it here
        while not stop.is_set():
            apply_size(force=False)
            time.sleep(0.2)

    poller = threading.Thread(target=poll_size, name="winsize-poll", daemon=True)
    poller.start()

    # Put stdin in raw-ish mode so keystrokes pass through cleanly
    old_tty = None
    try:
        if os.isatty(stdin_fd):
            old_tty = termios.tcgetattr(stdin_fd)
            tty.setraw(stdin_fd)
    except Exception:
        old_tty = None

    exit_code = 1
    try:
        while True:
            try:
                watch = [master_fd, stdin_fd]
                if inject_server is not None:
                    watch.append(inject_server)
                rfds, _, _ = select.select(watch, [], [], 0.2)
            except (InterruptedError, select.error):
                continue

            if inject_server is not None and inject_server in rfds:
                try:
                    conn, _addr = inject_server.accept()
                    _handle_inject_conn(
                        conn,
                        master_fd,
                        inject_marker_path or "",
                        injected_ids,
                        last_output_ns,
                    )
                except BlockingIOError:
                    pass
                except Exception:
                    pass

            if master_fd in rfds:
                try:
                    data = os.read(master_fd, 8192)
                except OSError as e:
                    if e.errno == errno.EIO:
                        break
                    raise
                if not data:
                    break
                last_output_ns = time.monotonic_ns()
                os.write(stdout_fd, data)

            if stdin_fd in rfds:
                try:
                    data = os.read(stdin_fd, 8192)
                except OSError:
                    data = b""
                if not data:
                    # EOF from user
                    break
                _safe_unlink(inject_marker_path)
                os.write(master_fd, data)

            # child exited?
            try:
                wpid, status = os.waitpid(pid, os.WNOHANG)
                if wpid == pid:
                    if os.WIFEXITED(status):
                        exit_code = os.WEXITSTATUS(status)
                    elif os.WIFSIGNALED(status):
                        exit_code = 128 + os.WTERMSIG(status)
                    break
            except ChildProcessError:
                break
    finally:
        stop.set()
        if old_tty is not None:
            try:
                termios.tcsetattr(stdin_fd, termios.TCSADRAIN, old_tty)
            except Exception:
                pass
        try:
            os.close(master_fd)
        except Exception:
            pass
        if inject_server is not None:
            try:
                inject_server.close()
            except Exception:
                pass
            _safe_unlink(inject_socket_path)
            _safe_unlink(inject_marker_path)
        # reap if still running
        try:
            wpid, status = os.waitpid(pid, 0)
            if os.WIFEXITED(status):
                exit_code = os.WEXITSTATUS(status)
            elif os.WIFSIGNALED(status):
                exit_code = 128 + os.WTERMSIG(status)
        except ChildProcessError:
            pass

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
