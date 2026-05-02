/**
 * GitHub OAuth token-exchange Worker.
 *
 * Why this Worker exists: GitHub's OAuth code-for-token exchange requires a
 * `client_secret` that must NOT be shipped to browsers. This Worker is the
 * minimum server-side hop that holds the secret and performs that swap.
 *
 * End-to-end flow:
 *   1. SPA redirects the browser to GitHub's `/authorize` URL with our
 *      `client_id`, `scope=gist`, `redirect_uri`, and a random `state`.
 *      This Worker rejects any token whose granted scope is not exactly
 *      `gist`, so the SPA must request only that.
 *   2. User approves on GitHub's consent screen.
 *   3. GitHub redirects back to `redirect_uri` with `?code=<short-lived>&state=...`.
 *      The SPA verifies `state` matches what it sent.
 *   4. SPA POSTs `{ code }` to this Worker.
 *   5. This Worker POSTs `{ client_id, client_secret, code }` to GitHub's
 *      `/access_token` endpoint and forwards GitHub's JSON response back to
 *      the SPA: `{ access_token, scope, token_type }` on success.
 *   6. SPA stores the token and uses it as `Authorization: Bearer <token>`
 *      for GitHub API calls (gist save/load/fork).
 *
 * Security model: the `Origin` allowlist is browser-CORS enforcement and
 * stops other websites from calling this endpoint from a victim's browser.
 * Outside the browser (curl, server) the endpoint is effectively public and
 * stays that way; the bound on abuse is OAuth's design, not the endpoint's
 * accessibility. A `code` is short-lived, single-use, and only obtainable by
 * driving a real browser through GitHub's consent screen for our registered
 * app, so a token an attacker can mint via curl is one for their own
 * account, which they could already create at `settings.github.com/tokens`.
 */
interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_CLIENT_ID_DEV: string;
  GITHUB_CLIENT_SECRET_DEV: string;
  ALLOWED_ORIGINS: string;
}

const expectedScope = "gist";
const devOrigin = "http://localhost:9111";

export default { fetch: handle };

/** Worker entry: routes preflight, rejects unknown origins, dispatches POST to GitHub token exchange. */
async function handle(req: Request, env: Env): Promise<Response> {
  const origin = matchedOrigin(req.headers.get("Origin"), env.ALLOWED_ORIGINS);
  if (!origin) return new Response("origin not allowed", { status: 403 });

  if (req.method === "OPTIONS") return preflight(origin);
  if (req.method !== "POST")
    return new Response("method not allowed", { status: 405 });

  return withCors(await handlePost(req, env, origin), origin);
}

async function handlePost(
  req: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    code?: unknown;
  } | null;
  if (!body || typeof body.code !== "string") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  return exchangeCode(body.code, env, origin);
}

/** Trade an OAuth `code` for a GitHub access token. Forwards GitHub's JSON body verbatim on success;
 * maps transport failures and non-2xx GitHub responses to 502. */
async function exchangeCode(
  code: string,
  env: Env,
  origin: string,
): Promise<Response> {
  const { clientId, clientSecret } = pickApp(env, origin);
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });
  let res: Response;
  try {
    res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
  } catch (e) {
    return Response.json(
      { error: "github_unreachable", message: String(e) },
      { status: 502 },
    );
  }
  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!res.ok || typeof data?.error === "string") {
    return Response.json(
      { error: "github_error", status: res.status, body: data },
      { status: 502 },
    );
  }
  const scope = typeof data?.scope === "string" ? data.scope : "";
  const granted = scope
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (granted.length !== 1 || granted[0] !== expectedScope) {
    return Response.json(
      { error: "unexpected_scope", granted: scope },
      { status: 502 },
    );
  }
  return Response.json(data);
}

/** Pick the prod or dev OAuth credentials based on the calling SPA's origin. */
function pickApp(
  env: Env,
  origin: string,
): { clientId: string; clientSecret: string } {
  if (origin === devOrigin) {
    return {
      clientId: env.GITHUB_CLIENT_ID_DEV,
      clientSecret: env.GITHUB_CLIENT_SECRET_DEV,
    };
  }
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  };
}

/** @return the request Origin if it appears in the comma-separated allowlist, else null. */
function matchedOrigin(origin: string | null, allowed: string): string | null {
  if (!origin) return null;
  const list = allowed
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return list.includes(origin) ? origin : null;
}

function preflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}

/** Clone `res` with CORS headers added for the given allowed origin. */
function withCors(res: Response, origin: string): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.append("Vary", "Origin");
  return new Response(res.body, { status: res.status, headers });
}
