#!/usr/bin/env python3
"""Validate real MariaDB Server Audit events from stdin (Python stdlib only).

Run via: docker compose ... exec -T db cat /var/lib/mysql/vedant-server-audit.log |
         python3 scripts/verify-audit-log.py

The Server Audit format changes with MariaDB releases (e.g. client port in 12+).
Rather than relying on fixed event column offsets, find the event token.
Only simple SQL probes are expected; do not parse complex SQL via CSV here.
"""

from __future__ import annotations

import sys


def parse_records(lines: list[str]) -> list[dict[str, str]]:
    parsed = []
    for raw in lines:
        # MariaDB quotes SQL literals in log entries; our checks only match
        # strings and return codes, so SQL containing commas can be rejoined.
        fields = raw.rstrip("\n").split(",")
        if len(fields) < 9:
            continue
        try:
            idx = next(i for i, value in enumerate(fields) if value in (
                "QUERY", "CONNECT", "FAILED_CONNECT", "DISCONNECT"))
        except StopIteration:
            continue
        if idx + 1 >= len(fields):
            continue
        parsed.append({
            "user": fields[2],
            "event": fields[idx],
            "statement": ",".join(fields[idx + 2:-1]),
            "error": fields[-1].strip(),
        })
    return parsed


def required(records: list[dict[str, str]], label: str, *, user: str,
             event: str, error: set[str], sql: str = "") -> None:
    matches = [r for r in records if
               r["user"] == user and r["event"] == event and
               r["error"] in error and sql.lower() in r["statement"].lower()]
    if not matches:
        raise AssertionError(
            f"Missing audit proof: {label} (user={user}, event={event}, "
            f"code={','.join(sorted(error))}, SQL contains={sql!r})")
    print(f"PASS audit record: {label}")


def main() -> int:
    records = parse_records(sys.stdin.readlines())
    if not records:
        print("FAIL: audit log empty or not in MariaDB Server Audit format", file=sys.stderr)
        return 1
    checks = (
        ("reader successful login", "project_reader", "CONNECT", {"0"}, ""),
        ("reader incorrect password", "project_reader", "FAILED_CONNECT", {"1045"}, ""),
        ("permitted public read", "project_reader", "QUERY", {"0"}, "SELECT * FROM user_directory"),
        ("blocked private data", "project_reader", "QUERY", {"1142"}, "SELECT password_hash FROM app_users"),
        ("blocked role escalation", "project_reader", "QUERY", {"1959"}, "SET ROLE role_admin"),
        ("revoked privilege blocked", "project_reader", "QUERY", {"1044", "1142"}, "vedant_revoked"),
        ("locked employee rejected", "project_employee", "FAILED_CONNECT", {"4151"}, ""),
        ("DENY defeats later GRANT", "project_auditor", "QUERY", {"1142"}, "vedant_deny"),
        ("REVOKE DENY permits grant", "project_auditor", "QUERY", {"0"}, "vedant_restored"),
    )
    for label, user, event, error, sql in checks:
        try:
            required(records, label, user=user, event=event, error=error, sql=sql)
        except AssertionError as exc:
            print(f"FAIL: {exc}", file=sys.stderr)
            return 1
    print(f"PASS: all audit assertions verified against {len(records)} log records")
    return 0


if __name__ == "__main__":
    sys.exit(main())
