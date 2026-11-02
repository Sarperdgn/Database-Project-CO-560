import { useState } from "react";
import { FlaskConical, RefreshCw, ShieldCheck } from "lucide-react";
import { ApiError, request, type Credentials } from "./api";

const roles = [
  ["Reader", "project_reader", "Allowed", "Denied", "Denied"],
  ["Employee", "project_employee", "Allowed", "Allowed", "Denied"],
  ["Auditor", "project_auditor", "Denied", "Denied", "Allowed"],
  ["Administrator", "project_admin", "Allowed", "Allowed", "Allowed"],
];

export function Permissions() {
  return <>
    <div className="section-heading"><div><span className="eyebrow muted-eyebrow">UNDERSTAND THE POLICY</span><h2>One database. Four perspectives.</h2><p>Compare the seeded roles, then sign in as each account to observe enforcement.</p></div></div>
    <section className="panel content-panel"><div className="table-toolbar"><div className="toolbar-text"><h3>Role permission matrix</h3><p>Expected initial policy · live grants may differ after SQL exercises</p></div><ShieldCheck size={24} /></div><div className="table-scroll"><table className="data-table"><thead><tr><th>ROLE / ACCOUNT</th><th>READ DIRECTORY</th><th>EDIT USERNAME</th><th>READ AUDIT</th></tr></thead><tbody>{roles.map(([role, account, ...permissions]) => <tr key={account}><td><strong>{role}</strong><div className="policy-account">{account}</div></td>{permissions.map((permission, index) => <td key={index}><span className={`event-badge ${permission === "Allowed" ? "event-success" : "event-failure"}`}>{permission}</span></td>)}</tr>)}</tbody></table></div><div className="table-footer">Source: database/security/02-roles.sql.in. This reference never controls access in the browser.</div></section>
    <div className="learning-grid"><article className="panel lesson"><span className="lesson-number">01 / AUTHENTICATE</span><h3>Your account is the connection</h3><p>Each protected request opens a MariaDB connection with the caller’s credentials. CURRENT_USER() and CURRENT_ROLE() identify the database principal.</p><code>SELECT CURRENT_USER(), CURRENT_ROLE();</code></article><article className="panel lesson"><span className="lesson-number">02 / AUTHORIZE</span><h3>Grant narrowly. Deny explicitly.</h3><p>Employees can update only usernames. Auditors can read login records, but explicit DENY rules prevent updating or deleting those records.</p><code>DENY UPDATE, DELETE ON login_audit TO role_auditor;</code></article><article className="panel lesson"><span className="lesson-number">03 / PROTECT DATA</span><h3>A view limits exposure</h3><p>The directory exposes IDs, names and email addresses. Password hashes remain outside the public view. A directory row is sample data, not a MariaDB account.</p><code>SELECT id, email, username FROM user_directory;</code></article></div>
  </>;
}

type Result = { label: string; status: string; detail: string };
export function AccessLab({ credentials }: { credentials: Credentials }) {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState("");
  async function run() {
    setBusy(true); setResults([]);
    const checks = [["API availability", "/health"], ["Database identity", "/api/me"], ["Directory access", "/api/users"], ["Audit access", "/api/audit"]];
    const next = await Promise.all(checks.map(async ([label, path]): Promise<Result> => {
      try {
        const data = await request<unknown>(path, path === "/health" ? undefined : credentials);
        return { label, status: "Allowed", detail: path === "/health" ? "HTTP 200 · API process reachable; does not prove database health" : `HTTP 200 · ${Array.isArray(data) ? data.length : 0} row(s) returned` };
      } catch (error) {
        return { label, status: error instanceof ApiError && error.status === 403 ? "Denied" : "Error", detail: `${error instanceof ApiError ? `HTTP ${error.status || "unreachable"} · ` : ""}${error instanceof Error ? error.message : "Request failed"}` };
      }
    }));
    setResults(next); setChecked(new Date().toLocaleTimeString()); setBusy(false);
  }
  return <><div className="section-heading"><div><span className="eyebrow muted-eyebrow">LIVE BACKEND CHECKS</span><h2>Access lab</h2><p>Run read-only requests as {credentials.username}. A denial is evidence of enforcement, not a failed demo.</p></div><button className="primary-button" onClick={() => void run()} disabled={busy}>{busy ? <RefreshCw size={18} className="spin" /> : <FlaskConical size={18} />} {busy ? "Checking…" : "Run access checks"}</button></div><section className="panel"><div className="panel-header"><h3>Observed results</h3><span className="panel-kicker">{checked ? `LAST RUN ${checked}` : "NOT YET RUN"}</span></div>{results.length ? <div className="check-list" aria-live="polite">{results.map(result => <div className="check-row" key={result.label}><div><strong>{result.label}</strong><p>{result.detail}</p></div><span className={`event-badge ${result.status === "Allowed" ? "event-success" : "event-failure"}`}>{result.status}</span></div>)}</div> : <div className="empty-state"><FlaskConical size={32} /><strong>{busy ? "Calling the API…" : "Put your permissions to the test"}</strong><p>Checks use your current account. No application rows or privileges are changed.</p></div>}</section><div className="learning-grid"><article className="panel lesson"><h3>Try the reader journey</h3><p>Sign in as project_reader. Read the directory, attempt a username edit, then open audit records. The two denied operations should return HTTP 403.</p></article><article className="panel lesson"><h3>Compare the employee</h3><p>Sign in as project_employee. Update a sample username in the directory and refresh to confirm persistence. Audit access should remain denied.</p></article><article className="panel lesson"><h3>Inspect audit visibility</h3><p>Sign in as project_auditor. The audit table is readable while the directory is denied. It starts empty, and console sign-ins do not add rows. Server Audit files are separate and unavailable through this API.</p></article></div></>;
}

