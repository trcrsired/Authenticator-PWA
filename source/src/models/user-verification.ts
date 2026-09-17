// Gate sensitive actions behind platform user verification
// (Face ID / Touch ID / Windows Hello / Android screen lock) via WebAuthn.
import { UserSettings } from "./settings";

export async function isUserVerificationAvailable(): Promise<boolean> {
  if (
    typeof PublicKeyCredential === "undefined" ||
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !==
      "function"
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function createOptions(discoverable: boolean): CredentialCreationOptions {
  return {
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Authenticator" },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "local-user",
        displayName: "Authenticator user",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        // Android/Google Password Manager only stores discoverable
        // credentials; non-resident keys can't be resolved later.
        residentKey: discoverable ? "required" : "discouraged",
        requireResidentKey: discoverable,
      },
      timeout: 60000,
    },
  };
}

// Creates a platform passkey; returns its credential id (base64), or null
// if enrollment failed / was cancelled / is unsupported.
export async function enrollUserVerification(): Promise<string | null> {
  if (!(await isUserVerificationAvailable())) {
    return null;
  }
  try {
    const cred = (await navigator.credentials.create(
      createOptions(true)
    )) as PublicKeyCredential | null;
    if (!cred) {
      return null;
    }
    return btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
  } catch (e) {
    // Android/Google Password Manager keeps one discoverable passkey
    // per RP and refuses a second create() with NotReadableError. The
    // existing passkey is still usable — resolve and adopt its id.
    if ((e as DOMException).name === "NotReadableError") {
      const adopted = await adoptExistingCredential();
      if (adopted) {
        return adopted;
      }
      // Nothing discoverable resolved (e.g. only an old non-discoverable
      // credential exists) — retry with the pre-passkey enrollment
      // options that demonstrably worked on this platform.
      try {
        const cred = (await navigator.credentials.create(
          createOptions(false)
        )) as PublicKeyCredential | null;
        if (cred) {
          return btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
        }
      } catch (e2) {
        console.error("WebAuthn non-resident enrollment failed", e2);
      }
      return null;
    }
    console.error("WebAuthn enrollment failed", e);
    // Surface the DOMException name so failures are diagnosable
    // (e.g. NotSupportedError on browsers without platform passkeys).
    alert(
      `${chrome.i18n.getMessage("verification_failed")} (${
        (e as DOMException).name || e
      })`
    );
    return null;
  }
}

// Resolves a passkey already registered for this origin (empty
// allowCredentials = any discoverable credential) and returns its id.
async function adoptExistingCredential(): Promise<string | null> {
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [],
        userVerification: "required",
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!assertion) {
      return null;
    }
    return btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)));
  } catch (e) {
    console.error("WebAuthn existing-credential lookup failed", e);
    alert(
      `${chrome.i18n.getMessage("verification_failed")} (${
        (e as DOMException).name || e
      })`
    );
    return null;
  }
}

// Tracks a gestureless startup verification so a real tap can abort it
// — Android only allows one pending WebAuthn request at a time.
let startupVerificationAbort: AbortController | null = null;

// After a successful import, offer to enable app-unlock verification —
// once ever, only when the platform supports it and nothing is enrolled.
export async function maybeOfferUnlockSetup(commit: (enabled: boolean) => void) {
  const items = UserSettings.items;
  if (
    items.uvAsked ||
    items.uvCredentialId ||
    items.requireUnlockVerification ||
    items.requireUserVerification
  ) {
    return;
  }
  if (!(await isUserVerificationAvailable())) {
    return;
  }
  items.uvAsked = true;
  await UserSettings.commitItems();
  if (!confirm(chrome.i18n.getMessage("ask_unlock_verification"))) {
    return;
  }
  const credentialId = await enrollUserVerification();
  if (credentialId) {
    items.uvCredentialId = credentialId;
    await UserSettings.commitItems();
    commit(true);
  }
}

// Prompts for biometric/screen-lock verification. Returns true when the
// WebAuthn API is unavailable so the feature degrades gracefully.
export async function verifyUser(
  credentialIdB64: string,
  signal?: AbortSignal
): Promise<boolean> {
  if (!(await isUserVerificationAvailable())) {
    return true;
  }
  try {
    const rawId = Uint8Array.from(atob(credentialIdB64), (c) =>
      c.charCodeAt(0)
    );
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [
          { type: "public-key", id: rawId, transports: ["internal"] },
        ],
        userVerification: "required",
        timeout: 60000,
      },
      signal,
    });
    return !!assertion;
  } catch (e) {
    if ((e as DOMException).name === "AbortError") {
      return false;
    }
    console.warn("WebAuthn verify with stored credential failed", e);
  }
  // Fallback: let the platform resolve any passkey registered for this
  // origin (Android stores passkeys as discoverable credentials).
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [],
        userVerification: "required",
        timeout: 60000,
      },
      signal,
    });
    return !!assertion;
  } catch (e) {
    if ((e as DOMException).name !== "AbortError") {
      console.error("WebAuthn verification failed", e);
    }
    return false;
  }
}

// Auto-prompt at app startup. If the platform needs a real gesture to
// show its UI (Android Edge), the tap-to-unlock overlay aborts this
// request first via cancelStartupVerification().
export async function verifyUserAtStartup(
  credentialIdB64: string
): Promise<boolean> {
  startupVerificationAbort = new AbortController();
  try {
    return await verifyUser(credentialIdB64, startupVerificationAbort.signal);
  } finally {
    startupVerificationAbort = null;
  }
}

export function cancelStartupVerification() {
  startupVerificationAbort?.abort();
}
