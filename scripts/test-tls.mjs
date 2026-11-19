import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { connectAs } from './dist/db.js';
const base = {host: 'db', user: 'project_reader', password: 'local-test-readonly-password', database: 'auth_project', connectTimeout: 5000};
const ssl = {ca: readFileSync(process.env.DB_SSL_CA), rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2'};
const db = await connectAs(base.user, base.password);
try {
  const [rows] = await db.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  assert.ok(rows[0].Value, 'Application connection must negotiate a cipher');
  console.log(`PASS TLS: application verifies CA and hostname; cipher ${rows[0].Value}`);
} finally { db.destroy(); }
async function rejected(label, options, codes, message) {
  await assert.rejects(async () => {
    const connection = await mysql.createConnection({...base, ...options});
    connection.destroy();
  }, error => {
    assert.ok(codes.includes(error.code), `${label}: unexpected ${error.code}: ${error.message}`);
    if (message) assert.match(error.message, message);
    return true;
  });
  console.log(`PASS TLS rejected: ${label}`);
}
await rejected('untrusted CA', {ssl: {...ssl, ca: []}}, ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'HANDSHAKE_SSL_ERROR'], /certificate|issuer|self.signed/i);
await rejected('wrong hostname on trusted certificate', {host: 'db-invalid', ssl}, ['ERR_TLS_CERT_ALTNAME_INVALID', 'HANDSHAKE_SSL_ERROR'], /hostname|altnames|IP.*cert/i);
await rejected('plaintext TCP', {ssl: false}, ['ER_ACCESS_DENIED_ERROR', 'ER_SECURE_TRANSPORT_REQUIRED']);
await rejected('wrong password over verified TLS', {ssl, password: 'incorrect'}, ['ER_ACCESS_DENIED_ERROR']);
console.log('All TLS tests passed.');
