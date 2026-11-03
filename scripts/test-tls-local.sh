#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

echo "==> Generating TLS certificates"

rm -rf database/tls/certs
./database/tls/generate-certs.sh

echo "==> TLS certificates generated successfully"

echo "==> Starting fresh MariaDB container"

docker compose down -v --remove-orphans
docker compose up -d --build db

echo "==> Waiting for MariaDB to become healthy"

for i in {1..60}; do
  STATUS="$(docker inspect \
    --format='{{.State.Health.Status}}' \
    "$(docker compose ps -q db)" 2>/dev/null || true)"

  if [[ "$STATUS" == "healthy" ]]; then
    echo "==> MariaDB is healthy"
    break
  fi

  if [[ "$i" -eq 60 ]]; then
    echo "ERROR: MariaDB did not become healthy"
    docker compose logs db
    exit 1
  fi

  sleep 2
done

echo "==> Verifying MariaDB TLS configuration"

TLS_VARS="$(docker compose exec -T db mariadb \
  --protocol=socket \
  -uroot \
  -p"$MARIADB_ROOT_PASSWORD" \
  -Nse "
SHOW VARIABLES LIKE 'have_ssl';
SHOW VARIABLES LIKE 'require_secure_transport';
")"

echo "$TLS_VARS"

grep -q $'have_ssl\tYES' <<< "$TLS_VARS" || {
  echo "ERROR: MariaDB TLS is not enabled"
  exit 1
}

grep -q $'require_secure_transport\tON' <<< "$TLS_VARS" || {
  echo "ERROR: require_secure_transport is not enabled"
  exit 1
}

echo "==> MariaDB TLS configuration verified"

echo "==> Starting API container"

docker compose up -d --build api

echo "==> Testing valid CA connection"

VALID_TLS_OUTPUT="$(
  docker compose exec -T \
    -e TEST_DB_PASSWORD="$ADMIN_DB_PASSWORD" \
    api node --input-type=module -e '
import fs from "node:fs";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: "db",
  port: 3306,
  user: "project_admin",
  password: process.env.TEST_DB_PASSWORD,
  ssl: {
    ca: fs.readFileSync("/etc/project-tls/ca.pem", "utf8"),
    rejectUnauthorized: true
  }
});

const [rows] = await conn.query("SHOW STATUS LIKE '\''Ssl_cipher'\''");

console.log(rows[0].Value);

await conn.end();
'
)"

echo "TLS cipher: $VALID_TLS_OUTPUT"

if [[ -z "$VALID_TLS_OUTPUT" ]]; then
  echo "ERROR: TLS cipher is empty"
  exit 1
fi

echo "==> Valid CA TLS connection verified"

echo "==> Testing invalid CA rejection"

docker compose cp \
  database/tls/certs/invalid-ca.pem \
  api:/tmp/invalid-ca.pem

INVALID_TLS_OUTPUT="$(
  docker compose exec -T \
    -e TEST_DB_PASSWORD="$ADMIN_DB_PASSWORD" \
    api node --input-type=module -e '
import fs from "node:fs";
import mysql from "mysql2/promise";

const ca = fs.readFileSync("/tmp/invalid-ca.pem", "utf8");

try {
  await mysql.createConnection({
    host: "db",
    port: 3306,
    user: "project_admin",
    password: process.env.TEST_DB_PASSWORD,
    ssl: {
      ca,
      rejectUnauthorized: true
    }
  });

  console.error("ERROR: invalid CA connection unexpectedly succeeded");
  process.exit(1);
} catch (err) {
  console.log(err.code ?? "");
  console.log(err.message ?? "");
}
'
)"

echo "$INVALID_TLS_OUTPUT"

grep -q "HANDSHAKE_SSL_ERROR" <<< "$INVALID_TLS_OUTPUT" || {
  echo "ERROR: invalid CA did not produce TLS handshake failure"
  exit 1
}

grep -qi "unable to verify" <<< "$INVALID_TLS_OUTPUT" || {
  echo "ERROR: invalid CA was not rejected because of certificate verification"
  exit 1
}

echo "==> Invalid CA correctly rejected"

echo "==> Testing plaintext connection rejection"

PLAINTEXT_OUTPUT="$(
  docker compose exec -T \
    -e TEST_DB_PASSWORD="$ADMIN_DB_PASSWORD" \
    api node --input-type=module -e '
import mysql from "mysql2/promise";

try {
  await mysql.createConnection({
    host: "db",
    port: 3306,
    user: "project_admin",
    password: process.env.TEST_DB_PASSWORD
  });

  console.error("ERROR: plaintext connection unexpectedly succeeded");
  process.exit(1);
} catch (err) {
  console.log(err.code ?? "");
  console.log(err.message ?? "");
}
'
)"

echo "$PLAINTEXT_OUTPUT"

grep -q "ER_SECURE_TRANSPORT_REQUIRED" <<< "$PLAINTEXT_OUTPUT" || {
  echo "ERROR: plaintext connection was not rejected as expected"
  exit 1
}

grep -qi "insecure transport" <<< "$PLAINTEXT_OUTPUT" || {
  echo "ERROR: rejection was not caused by secure transport enforcement"
  exit 1
}

echo "==> Plaintext connection correctly rejected"