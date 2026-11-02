export type Credentials = { username: string; password: string };
export type Identity = { account: string; role: string | null };
export type DirectoryUser = { id: number; email: string; username: string };
export type AuditRecord = {
  id: number;
  user_id: number | null;
  attempted_email: string;
  success: number | boolean;
  reason: string;
  ip_address: string | null;
  created_at: string;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function basicAuth({ username, password }: Credentials): string {
  if (!username || username.includes(":") || !password) throw new ApiError("Enter a username without colons and a non-empty password.", 400);
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  return `Basic ${encoded}`;
}

export async function request<T>(
  path: string,
  credentials?: Credentials,
  method = "GET",
  body?: Record<string, unknown>,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (credentials) headers.Authorization = basicAuth(credentials);
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError("Cannot reach the API. Start Docker Compose and check the Vite proxy settings.", 0);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (response.status === 429) throw new ApiError("Too many API requests. Wait for the rate limit to reset before retrying.", 429);
    if (response.status >= 500) throw new ApiError(`API unavailable (HTTP ${response.status}). Check that the backend is running.`, response.status);
    throw new ApiError(`Unexpected API response (HTTP ${response.status}).`, response.status);
  }

  if (!response.ok) {
    const error = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `Request failed (HTTP ${response.status}).`;
    throw new ApiError(error, response.status);
  }
  return payload as T;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  // Preserve timezone-free SQL timestamps rather than assigning a browser timezone.
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(date);
}
