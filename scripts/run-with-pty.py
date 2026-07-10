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
import os
import pty
import select
import signal
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
                rfds, _, _ = select.select([master_fd, stdin_fd], [], [], 0.2)
            except (InterruptedError, select.error):
                continue

            if master_fd in rfds:
                try:
                    data = os.read(master_fd, 8192)
                except OSError as e:
                    if e.errno == errno.EIO:
                        break
                    raise
                if not data:
                    break
                os.write(stdout_fd, data)

            if stdin_fd in rfds:
                try:
                    data = os.read(stdin_fd, 8192)
                except OSError:
                    data = b""
                if not data:
                    # EOF from user
                    break
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
