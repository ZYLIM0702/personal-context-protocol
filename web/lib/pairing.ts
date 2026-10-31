import { ApiError, deleteVault, getVault, putVault } from "./api";
import { encryptPassport, importPassport, type Passport } from "./pcp";

export const PAIR_TTL = 10 * 60_000;

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export type PairingOffer = { vid: string; secret: string; expires: number; url: string };

export async function createPairing(passport: Passport): Promise<PairingOffer> {
  const secret = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const vid = crypto.randomUUID();
  const expires = Date.now() + PAIR_TTL;
  const sealed = await encryptPassport({ ...passport, pair_expires: expires } as Passport, secret);
  await putVault(vid, sealed);
  return { vid, secret, expires, url: `${window.location.origin}/#pair=${vid}.${secret}` };
}

export async function receivePairing(vid: string, secret: string): Promise<Passport> {
  let blob: unknown;
  try {
    blob = await getVault(vid);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw new Error("This pairing code was already used or has expired.");
    throw error;
  }
  const imported = (await importPassport(JSON.stringify(blob), secret)) as Passport & { pair_expires?: number };
  await deleteVault(vid).catch(() => undefined);
  if (!imported.pair_expires || Date.now() > imported.pair_expires)
    throw new Error("This pairing code has expired. Make a new one on your computer.");
  delete imported.pair_expires;
  return imported;
}

export async function wasConsumed(vid: string): Promise<boolean> {
  try {
    await getVault(vid);
    return false;
  } catch (error) {
    return error instanceof ApiError && error.status === 404;
  }
}

export function deviceName(ua = navigator.userAgent) {
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "this OS";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  return `${browser} on ${os}`;
}

export const isLocalHost = () => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname);
