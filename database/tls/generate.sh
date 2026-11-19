#!/bin/sh
set -eu
# A project-scoped CA is generated at runtime, never baked into an image.
if [ -s /public/ca.pem ] && [ -s /certs/server.pem ]; then
  openssl verify -CAfile /public/ca.pem /certs/server.pem
  exit 0
fi
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 365 -subj '/CN=CO560 demo CA' -keyout "$work/ca-key.pem" -out /certs/ca.pem
openssl req -newkey rsa:3072 -nodes -subj '/CN=db' -keyout /certs/server-key.pem -out "$work/server.csr"
printf '%s\n' 'subjectAltName=DNS:db,DNS:localhost,IP:127.0.0.1' 'extendedKeyUsage=serverAuth' 'basicConstraints=CA:FALSE' > "$work/extensions"
openssl x509 -req -in "$work/server.csr" -CA /certs/ca.pem -CAkey "$work/ca-key.pem" -CAcreateserial -days 30 -sha256 -extfile "$work/extensions" -out /certs/server.pem
cp /certs/ca.pem /public/ca.pem
chown mysql:mysql /certs/*
chmod 600 /certs/server-key.pem
chmod 644 /certs/ca.pem /certs/server.pem /public/ca.pem
