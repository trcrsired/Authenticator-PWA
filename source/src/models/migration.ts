import * as CryptoJS from "crypto-js";
import { OTPAlgorithm, OTPType } from "./otp";

// Minimal structural type so callers don't need full OTPEntry objects.
export interface MigrationEntry {
  type: OTPType;
  issuer: string;
  account: string;
  secret: string | null;
  counter: number;
  digits: number;
  algorithm: OTPAlgorithm;
}

function byteArray2Base32(bytes: number[]) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const len = bytes.length;
  let result = "";
  let high = 0,
    low = 0,
    sh = 0,
    hasDataInLow = false;
  for (let i = 0; i < len; i += 5) {
    hasDataInLow = true;
    high = 0xf8 & bytes[i];
    result += chars.charAt(high >> 3);
    low = 0x07 & bytes[i];
    sh = 2;

    if (i + 1 < len) {
      high = 0xc0 & bytes[i + 1];
      result += chars.charAt((low << 2) + (high >> 6));
      result += chars.charAt((0x3e & bytes[i + 1]) >> 1);
      low = bytes[i + 1] & 0x01;
      sh = 4;
    }

    if (i + 2 < len) {
      high = 0xf0 & bytes[i + 2];
      result += chars.charAt((low << 4) + (high >> 4));
      low = 0x0f & bytes[i + 2];
      sh = 1;
    }

    if (i + 3 < len) {
      high = 0x80 & bytes[i + 3];
      result += chars.charAt((low << 1) + (high >> 7));
      result += chars.charAt((0x7c & bytes[i + 3]) >> 2);
      low = 0x03 & bytes[i + 3];
      sh = 3;
    }

    if (i + 4 < len) {
      hasDataInLow = false;
      high = 0xe0 & bytes[i + 4];
      result += chars.charAt((low << 3) + (high >> 5));
      result += chars.charAt(0x1f & bytes[i + 4]);
      low = 0;
      sh = 0;
    }
  }

  if (hasDataInLow) {
    result += chars.charAt(low << sh);
  }

  const padlen = 8 - (result.length % 8);
  return result + (padlen < 8 ? Array(padlen + 1).join("=") : "");
}

function wordArrayToByteArray(wordArray: CryptoJS.lib.WordArray) {
  const byteArray: number[] = [];
  for (let i = 0; i < wordArray.words.length; ++i) {
    const word = wordArray.words[i];
    for (let j = 3; j >= 0; --j) {
      byteArray.push((word >> (8 * j)) & 0xff);
    }
  }
  byteArray.length = wordArray.sigBytes;
  return byteArray;
}

function byteArray2String(bytes: number[]) {
  return String.fromCharCode.apply(null, bytes);
}

function subBytesArray(bytes: number[], start: number, length: number) {
  const subBytes: number[] = [];
  for (let i = 0; i < length; i++) {
    subBytes.push(bytes[start + i]);
  }
  return subBytes;
}

export function getOTPAuthPerLineFromOPTAuthMigration(migrationUri: string) {
  if (!migrationUri.startsWith("otpauth-migration:")) {
    return [];
  }

  const base64Data = decodeURIComponent(migrationUri.split("data=")[1]);
  const wordArrayData = CryptoJS.enc.Base64.parse(base64Data);
  const byteData = wordArrayToByteArray(wordArrayData);
  const lines: string[] = [];
  let offset = 0;
  while (offset < byteData.length) {
    if (byteData[offset] !== 10) {
      break;
    }
    // The OtpParameters length is a protobuf varint: it can take two
    // bytes once an entry's fields exceed 127 bytes.
    let lineLength = byteData[offset + 1];
    let lenBytes = 1;
    if (lineLength & 0x80) {
      lineLength = (lineLength & 0x7f) | (byteData[offset + 2] << 7);
      lenBytes = 2;
    }
    const secretStart = offset + lenBytes + 3;
    const secretLength = byteData[offset + lenBytes + 2];
    const secretBytes = subBytesArray(byteData, secretStart, secretLength);
    const secret = byteArray2Base32(secretBytes);
    const accountStart = secretStart + secretLength + 2;
    const accountLength = byteData[secretStart + secretLength + 1];
    const accountBytes = subBytesArray(byteData, accountStart, accountLength);
    const account = byteArray2String(accountBytes);
    const isserStart = accountStart + accountLength + 2;
    const isserLength = byteData[accountStart + accountLength + 1];
    const issuerBytes = subBytesArray(byteData, isserStart, isserLength);
    const issuer = byteArray2String(issuerBytes);
    const algorithm = ["SHA1", "SHA1", "SHA256", "SHA512", "MD5"][
      byteData[isserStart + isserLength + 1]
    ];
    const digits = [6, 6, 8][byteData[isserStart + isserLength + 3]];
    const type = ["totp", "hotp", "totp"][
      byteData[isserStart + isserLength + 5]
    ];
    let line = `otpauth://${type}/${account}?secret=${secret}&issuer=${issuer}&algorithm=${algorithm}&digits=${digits}`;
    if (type === "hotp") {
      let counter = 1;
      if (isserStart + isserLength + 7 <= lineLength) {
        counter = byteData[isserStart + isserLength + 7];
      }
      line += `&counter=${counter}`;
    }
    lines.push(line);
    offset += 1 + lenBytes + lineLength;
  }
  return lines;
}

// ==== otpauth-migration export (protobuf encoder) ====

// Keep each QR comfortably under the ~2953 byte QR capacity.
const MIGRATION_MAX_URI_LENGTH = 2200;

function base32ToBytes(base32: string): number[] {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = base32.toUpperCase().replace(/[\s=]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const c of clean) {
    const idx = chars.indexOf(c);
    if (idx === -1) {
      continue;
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return bytes;
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

function pushVarintValue(out: number[], value: number) {
  let v = value;
  while (v > 127) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

function pushVarintField(out: number[], field: number, value: number) {
  out.push(field << 3);
  pushVarintValue(out, value);
}

function pushBytesField(out: number[], field: number, bytes: number[]) {
  out.push((field << 3) | 2);
  pushVarintValue(out, bytes.length);
  for (const b of bytes) {
    out.push(b);
  }
}

function stringToBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

// Encodes one entry as an OtpParameters protobuf message. Returns null
// for types the migration format can't express (steam, battle) and for
// entries whose secret is still encrypted.
function entryToOtpParameters(entry: MigrationEntry): number[] | null {
  if (!entry.secret) {
    return null;
  }
  let secretBytes: number[];
  let migrationType: number; // 1 = HOTP, 2 = TOTP
  switch (entry.type) {
    case OTPType.totp:
      secretBytes = base32ToBytes(entry.secret);
      migrationType = 2;
      break;
    case OTPType.hotp:
      secretBytes = base32ToBytes(entry.secret);
      migrationType = 1;
      break;
    case OTPType.hex:
      secretBytes = hexToBytes(entry.secret);
      migrationType = 2;
      break;
    case OTPType.hhex:
      secretBytes = hexToBytes(entry.secret);
      migrationType = 1;
      break;
    default:
      return null;
  }
  if (!secretBytes.length) {
    return null;
  }
  const algorithm =
    entry.algorithm === OTPAlgorithm.SHA256
      ? 2
      : entry.algorithm === OTPAlgorithm.SHA512
      ? 3
      : 1;
  const params: number[] = [];
  pushBytesField(params, 1, secretBytes);
  pushBytesField(params, 2, stringToBytes(entry.account || ""));
  pushBytesField(params, 3, stringToBytes(entry.issuer || ""));
  pushVarintField(params, 4, algorithm);
  pushVarintField(params, 5, entry.digits === 8 ? 2 : 1);
  pushVarintField(params, 6, migrationType);
  if (migrationType === 1) {
    pushVarintField(params, 7, entry.counter || 0);
  }
  return params;
}

function bytesToBase64(bytes: number[]): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      bytes.slice(i, i + chunk)
    );
  }
  return btoa(bin);
}

function encodeMigrationPayload(
  otpParams: number[][],
  batchSize: number,
  batchIndex: number,
  batchId: number
): string {
  const payload: number[] = [];
  for (const params of otpParams) {
    pushBytesField(payload, 1, params);
  }
  pushVarintField(payload, 2, 1); // version
  pushVarintField(payload, 3, batchSize);
  pushVarintField(payload, 4, batchIndex);
  pushVarintField(payload, 5, batchId);
  return (
    "otpauth-migration://offline?data=" +
    encodeURIComponent(bytesToBase64(payload))
  );
}

// Returns one or more otpauth-migration:// URIs (batching like Google
// Authenticator when the payload would exceed QR capacity).
export function getOTPAuthMigrationUrisFromEntries(
  entries: MigrationEntry[]
): string[] {
  const batchId = Math.floor(Math.random() * 0x7fffffff);
  const batches: number[][][] = [];
  let current: number[][] = [];
  for (const entry of entries) {
    const params = entryToOtpParameters(entry);
    if (!params) {
      continue;
    }
    current.push(params);
    if (
      encodeMigrationPayload(current, 1, 0, batchId).length >
        MIGRATION_MAX_URI_LENGTH &&
      current.length > 1
    ) {
      current.pop();
      batches.push(current);
      current = [params];
    }
  }
  if (current.length) {
    batches.push(current);
  }
  return batches.map((batch, index) =>
    encodeMigrationPayload(batch, batches.length, index, batchId)
  );
}
