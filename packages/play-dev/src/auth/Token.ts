/**
 * Persisted GitHub OAuth token plus the user profile fields we cache
 * alongside it so the avatar renders without a `/user` round-trip on every
 * page load. GitHub OAuth Apps issue non-expiring tokens, so this cache is
 * sticky until sign-out or revocation.
 */
export interface AuthToken {
  accessToken: string;
  scope: string;
  login: string;
  avatarUrl: string;
}

export const tokenKey = "wgsl-play.token";

/** Read the persisted token, or null if missing/corrupt. */
export function readToken(): AuthToken | null {
  const raw = localStorage.getItem(tokenKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isAuthToken(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeToken(token: AuthToken): void {
  localStorage.setItem(tokenKey, JSON.stringify(token));
}

export function clearToken(): void {
  localStorage.removeItem(tokenKey);
}

function isAuthToken(v: unknown): v is AuthToken {
  if (!v || typeof v !== "object") return false;
  const t = v as Partial<AuthToken>;
  return (
    typeof t.accessToken === "string" &&
    typeof t.scope === "string" &&
    typeof t.login === "string" &&
    typeof t.avatarUrl === "string"
  );
}
