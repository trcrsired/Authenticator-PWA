// Gate sensitive actions behind platform user verification
// (Face ID / Touch ID / Windows Hello / Android screen lock) via WebAuthn.

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

// Creates a platform passkey; returns its credential id (base64), or null
// if enrollment failed / was cancelled / is unsupported.
export async function enrollUserVerification(): Promise<string | null> {
  if (!(await isUserVerificationAvailable())) {
    return null;
  }
  try {
    const cred = (await navigator.credentials.create({
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
          residentKey: "required",
          requireResidentKey: true,
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) {
      return null;
    }
    return btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
  } catch (e) {
    console.error("WebAuthn enrollment failed", e);
    return null;
  }
}

// Prompts for biometric/screen-lock verification. Returns true when the
// WebAuthn API is unavailable so the feature degrades gracefully.
export async function verifyUser(credentialIdB64: string): Promise<boolean> {
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
    });
    return !!assertion;
  } catch (e) {
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
    });
    return !!assertion;
  } catch (e) {
    console.error("WebAuthn verification failed", e);
    return false;
  }
}
