import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronRight,
  CircleAlert, Database, FileClock, Fingerprint, LayoutDashboard,
  LockKeyhole, LogOut, Menu, Pencil, RefreshCw, Search, Shield, 
  ShieldCheck, UsersRound, X,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { ApiError, formatTime, request, type AuditRecord, type Credentials, type DirectoryUser, type Identity } from "./api";

import { Permissions, AccessLab } from "./Learning";

type Page = "overview" | "directory" | "audit" | "permissions" | "lab";
type Resource<T> = { state: "loading" | "ready" | "forbidden" | "error"; rows: T[]; error?: string };
type Notice = { kind: "success" | "error"; text: string } | null;
const waiting = <T,>(): Resource<T> => ({ state: "loading", rows: [] });

const navigation: { id: Page; title: string; icon: LucideIcon }[] = [
  { id: "overview", title: "Overview", icon: LayoutDashboard },
  { id: "directory", title: "User directory", icon: UsersRound },
  { id: "audit", title: "Audit table", icon: FileClock },
  { id: "permissions", title: "Permissions", icon: ShieldCheck },
  { id: "lab", title: "Access lab", icon: FlaskConical },
];

function failure(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function resourceResult<T>(result: PromiseSettledResult<T[]>): Resource<T> {
  if (result.status === "fulfilled") return { state: "ready", rows: result.value };
  if (result.reason instanceof ApiError && result.reason.status === 403) return { state: "forbidden", rows: [] };
  return { state: "error", rows: [], error: failure(result.reason) };
}

function wordRole(role: string | null): string {
  return (role || "").replace(/^role_/, "").replace(/_/g, " ") || "Unassigned";
}

function Brand({ light = false, icon = true }: { light?: boolean; icon?: boolean }) {
  return (
    <div className={`brand ${light ? "brand-light" : ""}`}>
      {icon && <span className="brand-mark"><Database size={23} strokeWidth={2.25} /></span>}
      <span className="brand-type"><strong>Access Console</strong><small>MariaDB SECURITY STUDIO</small></span>
    </div>
  );
}

function Login({ onLogin, busy, loginError }: {
  onLogin: (credentials: Credentials) => Promise<boolean>;
  busy: boolean;
  loginError: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = busy || registerBusy;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const account = username.trim();
    if (!account || !password) { setError("Enter your MariaDB username and password."); return; }
    if (mode === "register") {
      if (!/^signup_[a-z0-9_]{3,24}$/.test(account)) { setError("Account names must be signup_ followed by 3 to 24 lowercase letters, digits or underscores."); return; }
      if (password.length < 12 || password.length > 128) { setError("The password must be between 12 and 128 characters."); return; }
      if (password !== confirm) { setError("Passwords do not match."); return; }
      setRegisterBusy(true);
      try {
        await request<{ username: string }>("/api/auth/register", undefined, "POST", { username: account, password });
      } catch (err) {
        setError(failure(err));
        setRegisterBusy(false);
        return;
      }
      setRegisterBusy(false);
    }
    const signedIn = await onLogin({ username: account, password });
    if (mode === "register" && !signedIn) {
      setMode("login");
      setError("Account created, but sign-in did not complete. Try signing in with the account you just created.");
    }
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError("");
    setConfirm("");
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Brand light icon={false} />
        <div className="auth-story">
          <h1>Database access.<br /><em>Clearly defined.</em></h1>
          <p>Explore database roles, test permissions, and see authentication and access control in action.</p>
          <div className="auth-capabilities">
            <div className="auth-capability"><span>01</span><div><strong>Identity & access</strong><p>Connect with your MariaDB account and inspect its permissions.</p></div></div>
            <div className="auth-capability"><span>02</span><div><strong>Directory & audit</strong><p>Explore records through database-enforced access controls.</p></div></div>
            <div className="auth-capability"><span>03</span><div><strong>Verify & understand</strong><p>Run access checks and inspect the results.</p></div></div>
          </div>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-form-wrap">
          <div className="mobile-brand"><Brand icon={false} /></div>
          <h2>{mode === "login" ? "Access your workspace" : "Create a read-only account"}</h2>
          <p className="auth-subtitle">{mode === "login" ? "Enter your existing MariaDB account credentials to continue." : "Create a restricted signup_* account. New users receive the read-only role."}</p>
          <div className="auth-switch" role="tablist" aria-label="Authentication mode">
            <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "selected" : ""} onClick={() => switchMode("login")}>Sign in</button>
            <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "selected" : ""} onClick={() => switchMode("register")}>Register</button>
          </div>
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="account">MariaDB username</label>
            <div className="field-wrap"><input id="account" autoComplete="username" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} placeholder={mode === "login" ? "project_reader" : "signup_yourname"} required /></div>
            <div className="field-label-row"><label htmlFor="password">Password</label></div>
            <div className="field-wrap"><input id="password" autoComplete={mode === "login" ? "current-password" : "new-password"} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><button type="button" className="field-action" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div>
            {mode === "register" && <><label htmlFor="confirm">Confirm password</label><div className="field-wrap"><input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Repeat your password" required /></div></>}
            {(error || loginError) && <div className="inline-alert error-alert" role="alert">{error || loginError}</div>}
            <button type="submit" className="primary-button full-width" disabled={pending}>{pending ? "Please wait…" : <>{mode === "login" ? "Sign in" : "Create account & sign in"}</>}</button>
          </form>
        </div>
      </main>
    </div>
  );
}

function Sidebar({ page, setPage, identity, onLogout, open, close }: {
  page: Page;
  setPage: (page: Page) => void;
  identity: Identity;
  onLogout: () => void;
  open: boolean;
  close: () => void;
}) {
  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={close} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Brand /><button className="icon-button sidebar-close" onClick={close} aria-label="Close menu"><X size={20} /></button></div>
        <div className="nav-heading">TESTING LAB</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} onClick={() => { setPage(item.id); close(); }} className={`nav-item ${page === item.id ? "active" : ""}`} aria-current={page === item.id ? "page" : undefined}><Icon size={19} strokeWidth={1.9} /><span>{item.title}</span>{page === item.id && <span className="nav-active-dot" />}</button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-profile"><span className="profile-avatar">{identity.account.charAt(0).toUpperCase()}</span><div className="profile-info"><strong title={identity.account}>{identity.account.split("@")[0]}</strong><small>{wordRole(identity.role)} role</small></div><button className="logout-icon" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={19} /></button></div>
        </div>
      </aside>
    </>
  );
}

function Stat({ icon: Icon, label, value, detail, tone = "blue" }: { icon: LucideIcon; label: string; value: string; detail: string; tone?: "blue" | "violet" | "mint" | "amber" }) {
  return <div className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}><Icon size={20} /></span><ArrowUpRight size={17} className="stat-arrow" /></div><span className="stat-label">{label}</span><strong className="stat-value" title={value}>{value}</strong><span className="stat-detail">{detail}</span></div>;
}

function Badge({ good, children }: { good: boolean; children: ReactNode }) {
  return <span className={`badge ${good ? "badge-good" : "badge-restricted"}`}><span className="badge-dot" />{children}</span>;
}

function Restricted({ type, state, error }: { type: string; state: Resource<unknown>["state"]; error?: string }) {
  if (state === "loading") return <div className="empty-state"><RefreshCw className="spin" size={25} /><strong>Loading {type}…</strong><p>Checking access with MariaDB.</p></div>;
  if (state === "forbidden") return <div className="empty-state"><span className="empty-state-icon"><LockKeyhole size={23} /></span><strong>Access restricted</strong><p>MariaDB denied this query for the active account. Sign in with a role that has access to {type}.</p><span className="denial-code">HTTP 403 · DATABASE DENIED</span></div>;
  if (state === "error") return <div className="empty-state"><span className="empty-state-icon danger"><CircleAlert size={23} /></span><strong>Unable to load {type}</strong><p>{error}</p></div>;
  return <div className="empty-state"><span className="empty-state-icon"><Database size={23} /></span><strong>{type === "audit data" ? "No stored audit rows" : "No records found"}</strong><p>{type === "audit data" ? "The initial table is empty. Signing in or running access checks does not add audit rows." : "There are no records to display for this view."}</p></div>;
}

function SectionHeading({ eyebrow, title, description, right }: { eyebrow: string; title: string; description: string; right?: React.ReactNode }) {
  return <div className="section-heading"><div><span className="eyebrow muted-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{right && <div className="section-heading-actions">{right}</div>}</div>;
}

function Overview({ identity, users, audit, onNavigate, previewMode = false }: {
  identity: Identity; users: Resource<DirectoryUser>; audit: Resource<AuditRecord>; onNavigate: (page: Page) => void; previewMode?: boolean;
}) {
  const account = identity.account.split("@")[0];
  const preview = users.rows.slice(0, 4);
  const auditPreview = audit.rows.slice(0, 4);
  return <>
    <div className="welcome-line"><div><span className="eyebrow muted-eyebrow">LAB OVERVIEW</span><h1>Access control lab</h1><p>{previewMode ? "Inspect sample identities, permissions, and audit records." : "Inspect your test account’s access and verify database controls."}</p></div></div>
    <div className="stats-grid">
      <Stat icon={Fingerprint} label={previewMode ? "Example account" : "Authenticated account"} value={account} detail={previewMode ? "Sample identity" : "Real MariaDB identity"} tone="blue" />
      <Stat icon={ShieldCheck} label={previewMode ? "Example role" : "Active database role"} value={wordRole(identity.role)} detail={previewMode ? "Illustrative role" : "Verified by CURRENT_ROLE()"} tone="violet" />
      <Stat icon={UsersRound} label="Directory rows shown" value={users.state === "ready" ? String(users.rows.length) : users.state === "loading" ? "…" : users.state === "forbidden" ? "Denied" : "Unavailable"} detail={previewMode ? "Example data, no API call" : "Up to 100 API results"} tone="mint" />
      <Stat icon={FileClock} label="Audit entries shown" value={audit.state === "ready" ? String(audit.rows.length) : audit.state === "loading" ? "…" : audit.state === "forbidden" ? "Denied" : "Unavailable"} detail={previewMode ? "Example data, no API call" : "Up to 100 API results"} tone="amber" />
    </div>
    <div className="overview-grid">
      <section className="panel"><div className="panel-header"><div><span className="panel-kicker">RESOURCE ACCESS</span><h3>Permission snapshot</h3></div><span className="panel-icon"><Shield size={18} /></span></div><p className="panel-subtitle">{previewMode ? "Illustrative permissions for this preview. No API checks have run." : "These statuses reflect real API responses, not frontend role assumptions."}</p><div className="permission-list"><div className="permission-row"><span className="permission-icon"><UsersRound size={19} /></span><div><strong>User directory</strong><small>SELECT on user_directory view</small></div><Badge good={users.state === "ready"}>{users.state === "ready" ? "Allowed" : users.state === "loading" ? "Checking" : users.state === "forbidden" ? "Denied" : "Unavailable"}</Badge></div><div className="permission-row"><span className="permission-icon"><FileClock size={19} /></span><div><strong>Login audit table</strong><small>SELECT on login_audit</small></div><Badge good={audit.state === "ready"}>{audit.state === "ready" ? "Allowed" : audit.state === "loading" ? "Checking" : audit.state === "forbidden" ? "Denied" : "Unavailable"}</Badge></div></div><div className="permission-footer"><ShieldCheck size={17} /> Authorization happens inside MariaDB 13.1.</div></section>
      <section className="panel identity-panel"><div className="panel-header"><div><span className="panel-kicker">YOUR CONNECTION</span><h3>Current identity</h3></div><span className="panel-icon"><Fingerprint size={18} /></span></div><div className="identity-art"><div className="identity-art-icon"><Database size={32} /></div><span className="identity-art-glow" /></div><div className="identity-rows"><div><span>Authenticated as</span><strong>{identity.account}</strong></div><div><span>Active role</span><strong>{identity.role || "No active role"}</strong></div><div><span>Authentication</span><strong>{previewMode ? "Not connected" : "HTTP Basic / MariaDB"}</strong></div></div></section>
    </div>
    <div className="overview-grid lower-grid">
      <section className="panel"><div className="panel-header"><div><span className="panel-kicker">DIRECTORY</span><h3>Directory rows</h3></div><button className="text-link" onClick={() => onNavigate("directory")}>View all <ArrowRight size={15} /></button></div>{users.state !== "ready" || preview.length === 0 ? <Restricted type="directory" state={users.state} error={users.error} /> : <div className="mini-list">{preview.map((user) => <div key={user.id} className="mini-row"><span className="user-avatar">{user.username.charAt(0).toUpperCase()}</span><div className="mini-row-text"><strong>{user.username}</strong><small>{user.email}</small></div><span className="mini-id">#{user.id}</span></div>)}</div>}</section>
      <section className="panel"><div className="panel-header"><div><span className="panel-kicker">AUDIT TABLE</span><h3>Audit table preview</h3></div><button className="text-link" onClick={() => onNavigate("audit")}>View all <ArrowRight size={15} /></button></div>{audit.state !== "ready" || auditPreview.length === 0 ? <Restricted type="audit data" state={audit.state} error={audit.error} /> : <div className="mini-list">{auditPreview.map((entry) => <div key={entry.id} className="mini-row"><span className={`audit-indicator ${Boolean(entry.success) ? "success" : "failure"}`}>{Boolean(entry.success) ? <Check size={17} /> : <X size={17} />}</span><div className="mini-row-text"><strong>{entry.attempted_email}</strong><small>{entry.reason}</small></div><span className="mini-time">{formatTime(entry.created_at)}</span></div>)}</div>}</section>
    </div>
  </>;
}

function Directory({ data, credentials, reload, notify }: {
  data: Resource<DirectoryUser>; credentials: Credentials; reload: () => Promise<void>; notify: (notice: Notice) => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const filtered = useMemo(() => data.rows.filter((user) => `${user.id} ${user.username} ${user.email}`.toLowerCase().includes(query.toLowerCase())), [data.rows, query]);

  async function save(id: number) {
    if (!/^[A-Za-z0-9_.-]{3,50}$/.test(draft)) { setEditError("Use 3 to 50 letters, digits, underscores, periods or hyphens."); return; }
    setSaving(true); setEditError("");
    try {
      await request<{ message: string }>(`/api/users/${id}`, credentials, "PATCH", { username: draft });
      setEditing(null);
      notify({ kind: "success", text: "The API executed the update request. Check the refreshed directory to confirm the value." });
      await reload();
    } catch (error) { setEditError(failure(error)); }
    finally { setSaving(false); }
  }

  return <>
    <SectionHeading eyebrow="IDENTITY MANAGEMENT" title="User directory" description="Explore the public directory view. Database permissions govern every change." right={<span className="count-tag">{data.state === "ready" ? data.rows.length : "N/A"} records</span>} />
    <section className="panel content-panel">
      <div className="table-toolbar"><div className="toolbar-text"><h3>Directory records</h3><p>Showing up to 100 rows returned by the API</p></div><div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search directory" placeholder="Search users…" /></div></div>
      {data.state !== "ready" ? <Restricted type="directory" state={data.state} error={data.error} /> : data.rows.length === 0 ? <Restricted type="directory" state="ready" /> : <div className="table-scroll"><table className="data-table"><thead><tr><th>USER</th><th>EMAIL ADDRESS</th><th>ID</th><th>ACTIONS</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><div className="table-user"><span className="user-avatar">{user.username.charAt(0).toUpperCase()}</span><div>{editing === user.id ? <input className="edit-input" autoFocus aria-label={`Edit username for ${user.username}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={50} /> : <strong>{user.username}</strong>}{editing === user.id && editError && <small className="edit-error">{editError}</small>}</div></div></td><td className="email-cell">{user.email}</td><td className="subtle-cell">#{user.id}</td><td>{editing === user.id ? <div className="table-actions"><button className="small-button save-button" disabled={saving} onClick={() => void save(user.id)}><Check size={15} /> Save</button><button className="icon-button" disabled={saving} onClick={() => { setEditing(null); setEditError(""); }} aria-label="Cancel edit"><X size={17} /></button></div> : <button className="small-button outline-button" onClick={() => { setEditing(user.id); setDraft(user.username); setEditError(""); }}><Pencil size={14} /> Edit</button>}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="search-empty">No users match “{query}”.</div>}</div>}
      <div className="table-footer"><ShieldCheck size={16} /> The API queries <code>user_directory</code>. Editing attempts use <code>PATCH /api/users/:id</code>; MariaDB may deny them.</div>
    </section>
  </>;
}

function Audit({ data }: { data: Resource<AuditRecord> }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");
  const filtered = useMemo(() => data.rows.filter((entry) => {
    const success = Boolean(entry.success);
    const matchesFilter = filter === "all" || (filter === "success" ? success : !success);
    const matchesText = `${entry.id} ${entry.attempted_email} ${entry.reason} ${entry.ip_address || ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesText;
  }), [data.rows, filter, query]);
  return <>
    <SectionHeading eyebrow="VISIBILITY & COMPLIANCE" title="Audit table" description="Read login_audit rows returned by the API. Console sign-ins do not populate this table." right={<span className="count-tag">{data.state === "ready" ? data.rows.length : "N/A"} rows</span>} />
    <section className="panel content-panel"><div className="table-toolbar"><div className="toolbar-text"><h3>Stored audit rows</h3><p>Read-only · up to 100 rows, ordered by ID descending</p></div><div className="toolbar-controls"><div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search audit records" placeholder="Search events…" /></div><select aria-label="Filter audit records" className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value as "all" | "success" | "failed")}><option value="all">All events</option><option value="success">Successful</option><option value="failed">Failed</option></select></div></div>
      {data.state !== "ready" ? <Restricted type="audit data" state={data.state} error={data.error} /> : data.rows.length === 0 ? <Restricted type="audit data" state="ready" /> : <div className="table-scroll"><table className="data-table"><thead><tr><th>EVENT</th><th>ATTEMPTED EMAIL</th><th>REASON</th><th>STORED IP ADDRESS</th><th>CREATED AT</th></tr></thead><tbody>{filtered.map((entry) => <tr key={entry.id}><td><span className={`event-badge ${Boolean(entry.success) ? "event-success" : "event-failure"}`}>{Boolean(entry.success) ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}{Boolean(entry.success) ? "Success" : "Failed"}</span></td><td className="table-strong">{entry.attempted_email}</td><td className="subtle-cell">{entry.reason}</td><td className="mono-cell">{entry.ip_address || "Not recorded"}</td><td className="subtle-cell nowrap">{formatTime(entry.created_at)}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="search-empty">No events match these filters.</div>}</div>}
      <div className="table-footer"><CircleAlert size={16} /> The API reads this table but never writes sign-in events or captures client IPs. IP is optional; created_at defaults to the database insertion time. Server Audit files are not exposed here.</div>
    </section>
  </>;
}

function DashboardPreview() {
  const [page, setPage] = useState<Page>("overview");
  const [open, setOpen] = useState(false);
  const identity: Identity = { account: "preview_admin@demo", role: "role_admin" };
  const users: Resource<DirectoryUser> = { state: "ready", rows: [
    { id: 1, username: "student", email: "student@example.invalid" },
  ] };
  const audit: Resource<AuditRecord> = { state: "ready", rows: [] };
  return <div className="app-shell">
    <Sidebar page={page} setPage={setPage} identity={identity} onLogout={() => { window.location.href = "/"; }} open={open} close={() => setOpen(false)} />
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={22} /></button><span>Internal testing</span><ChevronRight size={15} /><strong>{navigation.find(item => item.id === page)?.title}</strong></div><a className="small-button outline-button" href="/">Exit preview</a></header>
      <main className="main-content"><div className="info-strip" role="status"><strong>Preview mode</strong><span>Preview only. Shows the initial directory fixture and empty audit table. No backend requests are sent.</span></div>
      {page === "overview" && <Overview identity={identity} users={users} audit={audit} onNavigate={setPage} previewMode />}
      {page === "directory" && <><SectionHeading eyebrow="SAMPLE DATA" title="User directory" description="Illustrative directory records. Editing is unavailable in preview mode." /><section className="panel content-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>ID</th><th>USERNAME</th><th>EMAIL</th></tr></thead><tbody>{users.rows.map(user => <tr key={user.id}><td>{user.id}</td><td>{user.username}</td><td>{user.email}</td></tr>)}</tbody></table></div></section></>}
      {page === "audit" && <Audit data={audit} />}
      {page === "permissions" && <Permissions />}
      {page === "lab" && <section className="panel"><h2>Access lab</h2><p>Start the backend and sign in to run live access checks. This preview uses sample data.</p><a className="small-button outline-button" href="/">Back to sign in</a></section>}
      </main></div>
    </div>;
}

export default function App() {
  return new URLSearchParams(window.location.search).get("preview") === "1" ? <DashboardPreview /> : <LiveApp />;
}

function LiveApp() {
  const [session, setSession] = useState<Credentials | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [page, setPage] = useState<Page>("overview");
  const [users, setUsers] = useState<Resource<DirectoryUser>>(waiting());
  const [audit, setAudit] = useState<Resource<AuditRecord>>(waiting());
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const epoch = useRef(0);
  const [connection, setConnection] = useState("Checking connection");

  async function reload(credentials: Credentials) {
    const currentEpoch = ++epoch.current;
    setRefreshing(true);
    setConnection("Checking connection");
    setUsers(waiting());
    setAudit(waiting());
    const [meResult, usersResult, auditResult] = await Promise.allSettled([
      request<Identity[]>("/api/me", credentials),
      request<DirectoryUser[]>("/api/users", credentials),
      request<AuditRecord[]>("/api/audit", credentials),
    ]);
    if (currentEpoch !== epoch.current) return;
    if (meResult.status === "rejected") {
      if (meResult.reason instanceof ApiError && meResult.reason.status === 401) {
        logout();
        setLoginError("Your credentials were rejected. Sign in again.");
        return;
      } else {
        setConnection("Connection unavailable");
        setNotice({ kind: "error", text: failure(meResult.reason) });
      }
    } else {
      const first = meResult.value[0];
      if (first?.account) { setIdentity(first); setConnection("Session verified"); }
      else setConnection("Invalid identity response");
    }
    setUsers(resourceResult(usersResult));
    setAudit(resourceResult(auditResult));
    setRefreshing(false);
  }

  async function login(credentials: Credentials): Promise<boolean> {
    setBusy(true); setLoginError(""); setNotice(null);
    try {
      const identities = await request<Identity[]>("/api/me", credentials);
      if (!identities[0]?.account) throw new Error("The API returned an invalid identity.");
      setSession(credentials);
      setIdentity(identities[0]);
      setPage("overview");
      void reload(credentials);
      return true;
    } catch (err) { setLoginError(failure(err)); return false; }
    finally { setBusy(false); }
  }

  function logout() {
    epoch.current++;
    setSession(null); setIdentity(null); setUsers(waiting()); setAudit(waiting());
    setNotice(null); setMenuOpen(false); setRefreshing(false);
  }

  async function refresh() {
    if (!session) return;
    await reload(session);
  }

  if (!session || !identity) return <Login onLogin={login} busy={busy} loginError={loginError} />;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Sidebar page={page} setPage={setPage} identity={identity} onLogout={logout} open={menuOpen} close={() => setMenuOpen(false)} />
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={22} /></button><span className="breadcrumb-root">Internal testing</span><ChevronRight size={15} /><strong>{navigation.find((item) => item.id === page)?.title}</strong></div><div className="topbar-right"><span className="api-status"><span /> {connection}</span><span className="topbar-separator" /><button onClick={() => void refresh()} disabled={refreshing} className="refresh-button"><RefreshCw size={17} className={refreshing ? "spin" : ""} /><span>Refresh</span></button><span className="topbar-avatar">{identity.account.charAt(0).toUpperCase()}</span></div></header>
      <main id="main-content" className="main-content">
        {notice && <div className={`toast ${notice.kind === "success" ? "toast-success" : "toast-error"}`} role="status">{notice.kind === "success" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}{notice.text}<button aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={16} /></button></div>}
        {page === "overview" && <Overview identity={identity} users={users} audit={audit} onNavigate={setPage} />}
        {page === "directory" && <Directory data={users} credentials={session} reload={refresh} notify={setNotice} />}
        {page === "audit" && <Audit data={audit} />}
        {page === "permissions" && <Permissions />}
        {page === "lab" && <AccessLab credentials={session} />}
        <footer className="app-footer"><span>© 2026 Access Console · CO-560 Database Project</span><span><Activity size={14} /> Internal testing environment</span></footer>
      </main>
    </div>
  </div>;
}
