#!/usr/bin/env python3
"""
Spawn a command in a real PTY and forward terminal window resizes (SIGWINCH).

Why: macOS `script(1)` allocates a PTY but often freezes the child's rows/cols
at start size — Claude Code / other TUIs then ignore shell resize.

Usage:
  python3 scripts/run-with-pty.py <command> [args...]

Exit code: child exit status.
"""
from __future__ import annotations

import os
import pty
import sys


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("usage: run-with-pty.py <command> [args...]\n")
        return 2
    # CPython pty.spawn installs a SIGWINCH handler that copies TIOCGWINSZ
    # from stdin to the slave and signals the child — fixes fixed-size TUI.
    status = pty.spawn(sys.argv[1:])
    if hasattr(os, "waitstatus_to_exitcode"):
        return os.waitstatus_to_exitcode(status)
    # Older Python: raw wait status
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
