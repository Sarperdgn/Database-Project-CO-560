# Vedant — MariaDB auditing, security testing and reproducibility

**Project:** CO-560, Authentication and Access Control  
**Contribution:** MariaDB server-side audit-log configuration, attack/negative test cases, evidence validation, and reproducible isolated test harness.  
**Status:** Implementation and static checks prepared. **Real MariaDB execution remains to be run on a machine with Docker.** Do not report the scenarios as passed until the command below returns success.

## Match to the team's current implementation

This addition targets the repository's current **MariaDB 13.1** Compose image, real MariaDB accounts (`project_reader`, `project_employee`, `project_auditor`, `project_admin`), `role_readonly`, `role_auditor`, `user_directory`, `app_users`, `login_audit`, and **13.1 `DENY`**. It does **not** recreate the previous JWT login system or duplicate the team's `scripts/test-rbac-local.sh` tests. The existing `login_audit` table is illustrative application data; **it does not automatically record authentication events**. Real connections and SQL failures are captured by the MariaDB Server Audit plugin in a file instead.

## Files / format

| File | Format | Purpose |
| --- | --- | --- |
| `docker-compose.audit.yml` | YAML | Optional override enabling the audit configuration for `db`; standard Compose remains unchanged. |
| `database/audit/99-server-audit.cnf` | MariaDB INI | Loads Server Audit; turns on connection/query logging, file rotation, filtered SQL users and fail-closed plugin activation. |
| `scripts/test-security-audit-local.sh` | Bash | Runs attack scenarios against a **new temporary database volume**; automatically shuts down/removes only its test stack. |
| `scripts/verify-audit-log.py` | Python 3 | Reads actual MariaDB Server Audit log records and asserts nine pieces of audit evidence; fails if expected entries are absent. |
| `Vedant_README.md` | Markdown | Contribution instructions, test plan, and security assessment. |

## Reproduction on a clean checkout

Prerequisites: **Docker Engine**, **Docker Compose v2**, **Bash**, **Python 3**, network access to pull `quay.io/mariadb-foundation/mariadb-devel:13.1`, and sufficient disk space to build/test a disposable database container. Run commands from the repository root:

```bash
# Optional: validate the team's existing baseline first.
# The existing RBAC suite needs Docker, Bash, Node.js and npm.
npm ci
npm run build
npm run test:rbac

# Validate Vedant's isolated audit suite (no existing .env is required).
bash -n scripts/test-security-audit-local.sh
python3 -m py_compile scripts/verify-audit-log.py
bash scripts/test-security-audit-local.sh
```

The last script **creates a uniquely named `co560-vedant-...` Compose project**, writes disposable passwords to a mode-0600 temporary environment file, boots the `db` service with the audit override, runs SQL assertions, checks corresponding audit events, and removes **only that test project's** containers/volumes on exit. Existing development volumes and credentials are untouched. If a test fails, it exits nonzero and should not be described as a success. **Docker-based execution was not available where this patch was authored.**

### How to inspect logging manually

The standard `docker-compose.yml` is unchanged. For a separate manual stack with logging enabled:

```bash
cp .env.example .env          # if no .env exists; CHANGE ALL PASSWORDS
# Choose an unused Compose project name so it uses a fresh volume.
docker compose -p co560-audit-demo \
  -f docker-compose.yml -f docker-compose.audit.yml \
  up -d --wait db

docker compose -p co560-audit-demo \
  -f docker-compose.yml -f docker-compose.audit.yml \
  exec db mariadb -uroot -p -e "SHOW GLOBAL VARIABLES LIKE 'server_audit%';"

docker compose -p co560-audit-demo \
  -f docker-compose.yml -f docker-compose.audit.yml \
  exec db sh -c 'tail -n 25 /var/lib/mysql/vedant-server-audit.log'

# Only after confirming the demo project's volume contains no needed data:
docker compose -p co560-audit-demo \
  -f docker-compose.yml -f docker-compose.audit.yml down -v
```

`server_audit=FORCE_PLUS_PERMANENT` makes database startup fail if the plugin cannot be loaded and prevents unloading it during that server run. If this MariaDB development-image variant does not include `server_audit.so` or does not load `/etc/mysql/conf.d`, **the demo will fail and requires resolving image/config compatibility**, not a claim of working auditing. See `docker compose ... logs db`.

## Security attack matrix (expected, not yet proven on a running database)

| Scenario | MariaDB mechanism | Expected test result | Audit proof |
| --- | --- | --- | --- |
| Reader accesses public directory | `role_readonly` allows view SELECT | Succeeds | `CONNECT` and `QUERY`, code `0` |
| Reader sends wrong password | Database authentication | Rejected, `1045` | `FAILED_CONNECT`, `1045` |
| Reader requests `password_hash` | No privilege on private base table | Rejected, `1142` | `QUERY`, `1142` |
| Reader tries to UPDATE | Least privilege | Rejected, `1142` or `1143` | SQL assertion (audit plugin logs query) |
| Reader tries `SET ROLE role_admin` | Role not assigned | Rejected, `1959` | `QUERY`, `1959` |
| DBA revokes reader view SELECT | `REVOKE` removes role's privilege | Reader rejected, `1044` or `1142`; GRANT restores | `QUERY` with marker `vedant_revoked` |
| DBA locks employee account | `ALTER USER ... ACCOUNT LOCK` | Next login rejected, `4151`; unlock restores | `FAILED_CONNECT`, `4151` |
| DBA grants UPDATE to auditor despite `DENY` | 13.1 negative grant takes precedence | UPDATE rejected, `1142` | `QUERY` with marker `vedant_deny` |
| DBA removes UPDATE `DENY` while GRANT remains | `REVOKE DENY` removes prohibition | UPDATE allowed; original policy restored | `QUERY` with marker `vedant_restored`, code `0` |

The script confirms the **MariaDB error numbers**, not just unsuccessful command exit codes, to avoid mistaking a syntax error or connection failure for an effective security control. `verify-audit-log.py` checks the real plugin output separately. The script does not change the application's baseline tables: UPDATE probes target a nonexistent identifier; GRANT/DENY/lock changes occur inside the disposable stack.

## Threat model: what is and is not protected

- **Authentication:** MariaDB rejects invalid passwords and locked-account *new* connections. Account lock does **not** terminate sessions that already exist. Nothing here establishes protection against offline credential theft or password guessing at scale.
- **Roles and table/column privileges:** database checks stop readers viewing `password_hash` or writing, and stop role escalation. The permitted `user_directory` view still reveals its intended public columns to authorized readers. The project administrator is intentionally privileged on project data.
- **MariaDB 13.1 `DENY`:** auditor write is explicitly blocked even if a later grant would otherwise allow it. `REVOKE DENY` reverses that rule; administrators with sufficient privileges can change policy. This is **not** available on older MariaDB versions (such as 11.8).
- **Server Audit:** records failed/successful connections and statements, including rejected statements with nonzero error codes. **Logging does not block attacks**. The independent `login_audit` SQL table is *not* automatically populated with these events and should not be presented as a server login audit.
- **Log access and secrecy:** the `QUERY` audit event records literal SQL, which might contain sensitive values. Query capture is restricted to the four demo accounts; **connection events still cover all users**. Logs reside in a database-only volume and are deliberately not added to the Git repository. The local DBA/container host can still read or tamper with files. Production deployments need secure off-host storage, access controls, retention, and monitoring. The included rotation settings are a demo, not compliance-grade retention.
- **Transport and authentication-method rubric:** this contribution **does not implement verified TLS or ED25519/PARSEC/Unix-socket user authentication**. In the team's checkout, TLS and an alternative-to-plaintext-config credential flow need separate integration and test evidence. The optional HTTP Basic API should not be exposed over plain HTTP on untrusted networks.

## Presentation / evidence checklist

To demonstrate live, run `bash scripts/test-security-audit-local.sh` on screen and show the distinct PASS lines for **actual access-control errors** and **actual audit-log events**. Screenshots/video are optional; for a reproducible submission the code and this README are authoritative. 

## References

- [MariaDB Audit Plugin Installation](https://mariadb.com/docs/server/reference/plugins/mariadb-audit-plugin/mariadb-audit-plugin-installation)
- [MariaDB Audit Plugin Log Settings](https://mariadb.com/docs/server/reference/plugins/mariadb-audit-plugin/mariadb-audit-plugin-log-settings)
- [MariaDB Audit Plugin Options](https://mariadb.com/docs/server/reference/plugins/mariadb-audit-plugin/mariadb-audit-plugin-options-and-system-variables)
- [MariaDB Account Locking](https://mariadb.com/docs/server/security/user-account-management/account-locking)
- [MariaDB 13.1 DENY feature](https://mariadb.org/mariadb-13-1-feature-in-focus-deny-negative-grants/)
