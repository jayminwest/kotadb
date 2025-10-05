#!/usr/bin/env -S uv run python3
"""Common Bun/TypeScript command helpers for ADW orchestration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class Command:
    label: str
    argv: tuple[str, ...]

    def render(self) -> str:
        return " ".join(self.argv)


BUN_INSTALL = Command("install dependencies", ("bun", "install"))
BUN_BUILD = Command("build", ("bun", "run", "build"))
BUN_TYPECHECK = Command("typecheck", ("bun", "run", "typecheck"))
BUN_TEST = Command("test", ("bun", "test"))
BUN_LINT = Command("lint", ("bun", "run", "lint"))


def validation_commands(lockfile_changed: bool = False) -> list[Command]:
    """Return the default validation commands for Bun/TypeScript projects."""

    commands: list[Command] = []
    if lockfile_changed:
        commands.append(BUN_INSTALL)
    commands.extend([BUN_LINT, BUN_TYPECHECK, BUN_TEST, BUN_BUILD])
    return commands


def serialize_commands(commands: Iterable[Command]) -> list[dict[str, str]]:
    """Convert commands into a serialisable representation."""

    return [{"label": cmd.label, "cmd": cmd.render()} for cmd in commands]
