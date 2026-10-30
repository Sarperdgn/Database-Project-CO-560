# Unix-socket authentication (Area 5)

This is an **alternative MariaDB login method** for a dedicated local OS identity, separate from the HTTP Basic / MariaDB password logins used by the existing Express API.

`database/Dockerfile` adds the Linux user `project_socket` to the MariaDB container. On fresh-volume initialization, `database/init/03-unix-socket.sql` creates the matching database account `project_socket@localhost` with MariaDB's `unix_socket` plugin, grants the existing `role_readonly`, and makes it the default role. MariaDB reads the operating system peer identity from the Unix socket. No MariaDB password is stored for this account.

## Test (requires Docker with Compose v2)

```bash
bash scripts/test-unix-socket-local.sh
```

The integration test uses a uniquely named, disposable Compose project, verifies passwordless socket login, `CURRENT_USER()` and `CURRENT_ROLE()`, an authorized directory read, unauthorized writes and private reads, forbidden role escalation, an OS-user mismatch, and attempted TCP authentication. Every negative test asserts the **specific MariaDB error code**; a broken connection does not count as an authorization success. Its database volume is deleted at the end. Do **not** use `docker compose down -v` against your existing project.

To inspect interactively in your regular Compose project *after starting with a fresh database volume*:

```bash
docker compose exec -u project_socket db \
  mariadb --no-defaults --protocol=socket -u project_socket --skip-password auth_project
```

If you already have a database volume, the bootstrap SQL **will not run again**. Apply `database/init/03-unix-socket.sql` as an administrator to that existing database after adding the OS user via the updated Docker image, then recreate the database container. Do not delete your populated volume.

## Security boundary

The socket grants only the read-only database role; no SQL superuser authority or host-wide access is granted. Unix-socket authentication works only **inside the DB container**, where the matching OS user exists and can open the socket. It does not turn HTTP Basic into passwordless login or work across the API container's TCP connection. A process that can run as `project_socket` in the DB container can authenticate as that MariaDB account; restrict container and Docker-daemon access. This feature does not provide TCP encryption/TLS.
