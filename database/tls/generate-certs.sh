#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="${1:-database/tls/certs}"

mkdir -p "$CERT_DIR"

echo "Generating local test CA..."

openssl genrsa \
  -out "$CERT_DIR/ca-key.pem" \
  4096

openssl req \
  -x509 \
  -new \
  -nodes \
  -key "$CERT_DIR/ca-key.pem" \
  -sha256 \
  -days 3650 \
  -out "$CERT_DIR/ca.pem" \
  -subj "/CN=CO560 Local Test CA"


echo "Generating MariaDB server key..."

openssl genrsa \
  -out "$CERT_DIR/server-key.pem" \
  2048


cat > "$CERT_DIR/server.cnf" <<'CONF'
[req]
distinguished_name = dn
req_extensions = req_ext
prompt = no

[dn]
CN = db

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = db
DNS.2 = localhost
IP.1 = 127.0.0.1
CONF


echo "Generating MariaDB server CSR..."

openssl req \
  -new \
  -key "$CERT_DIR/server-key.pem" \
  -out "$CERT_DIR/server.csr" \
  -config "$CERT_DIR/server.cnf"


cat > "$CERT_DIR/server-ext.cnf" <<'CONF'
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:db,DNS:localhost,IP:127.0.0.1
CONF


echo "Signing MariaDB server certificate..."

openssl x509 \
  -req \
  -in "$CERT_DIR/server.csr" \
  -CA "$CERT_DIR/ca.pem" \
  -CAkey "$CERT_DIR/ca-key.pem" \
  -CAcreateserial \
  -out "$CERT_DIR/server-cert.pem" \
  -days 825 \
  -sha256 \
  -extfile "$CERT_DIR/server-ext.cnf"


echo "Generating invalid CA for negative TLS tests..."

openssl genrsa \
  -out "$CERT_DIR/invalid-ca-key.pem" \
  4096

openssl req \
  -x509 \
  -new \
  -nodes \
  -key "$CERT_DIR/invalid-ca-key.pem" \
  -sha256 \
  -days 3650 \
  -out "$CERT_DIR/invalid-ca.pem" \
  -subj "/CN=CO560 Invalid Test CA"


chmod 600 \
  "$CERT_DIR/ca-key.pem" \
  "$CERT_DIR/server-key.pem" \
  "$CERT_DIR/invalid-ca-key.pem"

chmod 644 \
  "$CERT_DIR/ca.pem" \
  "$CERT_DIR/server-cert.pem" \
  "$CERT_DIR/invalid-ca.pem"


echo
echo "TLS certificates generated in $CERT_DIR"
echo
echo "Server certificate:"
openssl x509 \
  -in "$CERT_DIR/server-cert.pem" \
  -noout \
  -subject \
  -issuer

echo
echo "Server Subject Alternative Names:"
openssl x509 \
  -in "$CERT_DIR/server-cert.pem" \
  -noout \
  -text | grep -A2 "Subject Alternative Name"
