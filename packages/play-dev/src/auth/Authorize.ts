/**
 * Begin the GitHub OAuth dance: stash a single-use `state` in sessionStorage
 * and redirect to GitHub's authorize endpoint.
 *
 * sessionStorage is keyed by tab and survives navigation to other origins,
 * so the state we stash here is still readable when GitHub redirects back.
 * Cross-tab isolation is desirable: a sign-in started in tab A cannot be
 * completed by tab B.
 */

const prodClientId = "Ov23li6iYF3wfpn2cdgM";
const devClientId = "Ov23liXTsm3BlRW2gJVv";
const devOrigin = "http://localhost:9111";
const authorizeUrl = "https://github.com/login/oauth/authorize";
export const stateKey = "wgsl-play.oauth-state";

/** Generate state, persist it, and redirect the tab to GitHub. */
export function startSignIn(): void {
  const state = crypto.randomUUID();
  sessionStorage.setItem(stateKey, state);
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: `${location.origin}/auth/callback`,
    scope: "gist",
    state,
    allow_signup: "true",
  });
  location.assign(`${authorizeUrl}?${params}`);
}

function clientId(): string {
  return location.origin === devOrigin ? devClientId : prodClientId;
}

/** Read and clear the stored state. Returns null if no sign-in was started in this tab. */
export function takeStoredState(): string | null {
  const value = sessionStorage.getItem(stateKey);
  sessionStorage.removeItem(stateKey);
  return value;
}
