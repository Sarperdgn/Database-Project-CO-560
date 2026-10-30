# Visual Test and Security Verification Screenshots

This directory stores terminal screenshots demonstrating verified security controls and passing test runs against live **MariaDB 13.1.2-MariaDB-ubu2604**.

## Interactive Scenario Runner

To reproduce and display all five scenarios sequentially on your terminal:

```bash
bash scripts/show-screenshot-scenarios.sh
```

## Evidence Manifest

| File | Scenario | Key Output Verified |
| --- | --- | --- |
| `01-test-suites-pass.png` | Automated Test Suites | All 4 test suites passing against MariaDB 13.1 |
| `02-column-privilege-denial.png` | View vs Column Isolation | `SELECT (id, email, username)` on `user_directory` allowed; `SELECT password_hash FROM app_users` denied with `ERROR 1143` |
| `03-deny-override-conflict.png` | MariaDB 13.1 `DENY` | `mysql.global_priv` JSON `$.denies` verified; `UPDATE login_audit` denied with `ERROR 1142` |
| `04-server-audit-logging.png` | MariaDB Server Audit | Live `/var/lib/mysql/vedant-server-audit.log` showing `CONNECT` and `FAILED_QUERY` events |
| `05-unix-socket-peer-auth.png` | Unix Socket Peer Auth | Passwordless local OS login via `unix_socket`; non-matching OS / TCP logins rejected |
