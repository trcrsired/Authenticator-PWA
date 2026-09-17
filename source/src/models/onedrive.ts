import { Encryption } from "./encryption";
import { EntryStorage } from "./storage";
import { UserSettings } from "./settings";

// Register an Azure AD app as a "Single-page application" and paste its
// Application (client) ID below. Redirect URIs to register:
//   https://<your-deployed-origin>/
//   http://localhost:<port>/        (for local dev)
// No client secret: SPA public clients authenticate with PKCE.
const CLIENT_ID = "";
const SCOPES = "Files.ReadWrite.AppFolder offline_access User.Read";

const AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH = "https://graph.microsoft.com/v1.0";
const PKCE_SESSION_KEY = "onedrive_pkce";

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function redirectUri(): string {
  return location.origin + "/";
}

export function isConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

export function isSignedIn(): boolean {
  return Boolean(
    UserSettings.items.oneDriveToken ||
      UserSettings.items.oneDriveRefreshToken
  );
}

// Starts the OAuth dance: stash the PKCE verifier, then full-page
// redirect to Microsoft. On return, popup.ts calls handleRedirect().
export async function signIn(): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier)
      )
    )
  );
  sessionStorage.setItem(
    PKCE_SESSION_KEY,
    JSON.stringify({ verifier, state })
  );
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    response_mode: "query",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

// Called on app load: completes the sign-in when Microsoft redirects
// back with ?code=...&state=... No-op on normal loads.
export async function handleRedirect(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return;
  }
  const raw = sessionStorage.getItem(PKCE_SESSION_KEY);
  sessionStorage.removeItem(PKCE_SESSION_KEY);
  history.replaceState(null, "", location.pathname);
  if (!raw) {
    return;
  }
  const pkce = JSON.parse(raw);
  if (pkce.state !== state) {
    return;
  }
  await UserSettings.updateItems();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: pkce.verifier,
      scope: SCOPES,
    }).toString(),
  });
  const data = await res.json();
  if (data.access_token) {
    UserSettings.items.oneDriveToken = data.access_token;
    UserSettings.items.oneDriveRefreshToken = data.refresh_token;
    UserSettings.commitItems();
  }
}

async function refreshToken(): Promise<boolean> {
  await UserSettings.updateItems();
  if (!UserSettings.items.oneDriveRefreshToken) {
    return false;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      refresh_token: UserSettings.items.oneDriveRefreshToken,
      grant_type: "refresh_token",
      scope: SCOPES,
    }).toString(),
  });
  const data = await res.json();
  if (data.access_token) {
    UserSettings.items.oneDriveToken = data.access_token;
    if (data.refresh_token) {
      UserSettings.items.oneDriveRefreshToken = data.refresh_token;
    }
    UserSettings.commitItems();
    return true;
  }
  if (data.error === "invalid_grant") {
    UserSettings.items.oneDriveToken = undefined;
    UserSettings.items.oneDriveRefreshToken = undefined;
    UserSettings.items.oneDriveRevoked = true;
    UserSettings.commitItems();
  }
  return false;
}

// Returns a valid access token, refreshing when the cached one expired.
async function getToken(): Promise<string> {
  await UserSettings.updateItems();
  const token = UserSettings.items.oneDriveToken;
  if (token) {
    const res = await fetch(`${GRAPH}/me/drive/special/approot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      return token;
    }
  }
  if (await refreshToken()) {
    return UserSettings.items.oneDriveToken || "";
  }
  return "";
}

export async function uploadBackup(encryption: Encryption): Promise<boolean> {
  await UserSettings.updateItems();
  if (UserSettings.items.oneDriveEncrypted === undefined) {
    UserSettings.items.oneDriveEncrypted = true;
    UserSettings.commitItems();
  }
  const exportData = await EntryStorage.backupGetExport(
    encryption,
    UserSettings.items.oneDriveEncrypted === true
  );
  const backup = JSON.stringify(exportData, null, 2);
  const token = await getToken();
  if (!token) {
    return false;
  }
  const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const res = await fetch(
    `${GRAPH}/me/drive/special/approot:/${now}.json:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: backup,
    }
  );
  if (res.status === 401) {
    UserSettings.items.oneDriveToken = undefined;
    UserSettings.commitItems();
    return false;
  }
  const data = await res.json();
  return !data.error;
}

export async function getUserEmail(): Promise<string> {
  const token = await getToken();
  if (!token) {
    return "";
  }
  const res = await fetch(`${GRAPH}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.userPrincipalName || data.mail || "";
}

export function signOut(): void {
  UserSettings.items.oneDriveToken = undefined;
  UserSettings.items.oneDriveRefreshToken = undefined;
  UserSettings.commitItems();
}
