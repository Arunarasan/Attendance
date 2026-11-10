/**
 * Device key: proves "this is the bound phone". In the Android app it lives in the hardware Keystore (bridge);
 * in a browser it is a non-extractable ECDSA P-256 key in IndexedDB.
 */
declare global {
  interface Window {
    AndroidKeystore?: { publicKey(): string; sign(data: string): string }
    AndroidWifi?: { bssid(): string }
  }
}

/** The connected access point's BSSID, available only inside the Android app (browsers cannot read WiFi details). */
export function wifiBssid(): string | undefined {
  try {
    const b = window.AndroidWifi?.bssid()
    return b && b !== '02:00:00:00:00:00' ? b : undefined
  } catch { return undefined }
}

const DB = 'attendance-device'
const STORE = 'keys'

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function load(): Promise<CryptoKeyPair | null> {
  const db = await idb()
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get('pair')
    q.onsuccess = () => res((q.result as CryptoKeyPair) ?? null)
    q.onerror = () => rej(q.error)
  })
}
async function save(p: CryptoKeyPair) {
  const db = await idb()
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(p, 'pair')
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))

export const hasNativeKeystore = () => typeof window !== 'undefined' && !!window.AndroidKeystore

export async function getOrCreateKey(): Promise<CryptoKeyPair> {
  let p = await load()
  if (!p) {
    p = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
    await save(p)
  }
  return p
}

export async function publicKeyB64(): Promise<string> {
  if (window.AndroidKeystore) return window.AndroidKeystore.publicKey()
  const p = await getOrCreateKey()
  return b64(await crypto.subtle.exportKey('spki', p.publicKey))
}

export async function signNonce(nonce: string): Promise<string> {
  if (window.AndroidKeystore) return window.AndroidKeystore.sign(nonce)
  const p = await getOrCreateKey()
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, p.privateKey, new TextEncoder().encode(nonce))
  return b64(sig) // raw r||s, which the server accepts
}

export async function hasLocalKey(): Promise<boolean> {
  if (window.AndroidKeystore) return true
  try { return (await load()) !== null } catch { return false }
}
