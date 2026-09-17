import { BrowserStorage, isOldKey } from "./storage";
import argon2 from "argon2-browser";

export async function argonHash(
  value: string,
  salt: string
): Promise<string | undefined> {
  const hash = await argon2.hash({
    pass: value,
    salt: salt,
    time: 2,
    mem: 1024 * 19,
    parallelism: 1,
    hashLen: 32,
    type: argon2.ArgonType.Argon2id,
  });
  return hash.encoded;
}

export async function argonVerify(
  value: string,
  hash: string
): Promise<boolean> {
  try {
    await argon2.verify({
      pass: value,
      encoded: hash,
    });
    return true;
  } catch (e) {
    console.error("Error decoding hash", e);
    return false;
  }
}

// Verify a password using keys in BrowserStorage
export async function verifyPasswordUsingKeyID(
  keyId: string,
  password: string
): Promise<boolean> {
  // Get key for current encryption
  const keys = await BrowserStorage.getKeys();
  if (isOldKey(keys)) {
    throw new Error(
      "v3 encryption not being used with verifyPassword. This should never happen!"
    );
  }

  const key = keys.find((key) => key.id === keyId);
  if (!key) {
    throw new Error(`Key ${keyId} not in BrowserStorage`);
  }

  return verifyPasswordUsingKey(key, password);
}

export async function verifyPasswordUsingKey(
  key: Key,
  password: string
): Promise<boolean> {
  // Hash password with argon
  const rawHash = await argonHash(password, key.salt);
  if (!rawHash) {
    throw new Error("argon2 did not return a hash!");
  }
  // https://passlib.readthedocs.io/en/stable/lib/passlib.hash.argon2.html#format-algorithm
  const possibleHash = rawHash.split("$")[5];

  // verify user password by comparing their password hash with the
  // hash of their password's hash
  return await argonVerify(possibleHash, key.hash);
}
