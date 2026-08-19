/**
 * Not in DEVELOPMENT.md's tree: persistence has to live somewhere, and
 * scattering localStorage calls would hide the only place secrets rest.
 * IndexedDB is a mirror of localStorage, not a second source of truth.
 */
const PREFIX = "snapsats.v0.";
export const STORE_KEYS = {
  held: `${PREFIX}held`,
  pending: `${PREFIX}pending`,
};

const memory = new Map();

function lsGet(key) {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    }
  } catch {
    /* quota / private mode — fall through */
  }
  return memory.has(key) ? memory.get(key) : null;
}

function lsSet(key, value) {
  memory.set(key, value);
  const raw = JSON.stringify(value);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, raw);
  } catch {
    /* ignore */
  }
  idbSet(key, value);
}

function lsRemove(key) {
  memory.delete(key);
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  idbSet(key, null);
}

function idbSet(key, value) {
  if (typeof indexedDB === "undefined") return;
  const req = indexedDB.open("snapsats", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("kv");
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");
    if (value == null) store.delete(key);
    else store.put(value, key);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  };
}

async function idbGet(key) {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    const req = indexedDB.open("snapsats", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("kv", "readonly");
      const get = tx.objectStore("kv").get(key);
      get.onsuccess = () => {
        db.close();
        resolve(get.result ?? null);
      };
      get.onerror = () => {
        db.close();
        resolve(null);
      };
    };
  });
}

/** Hydrate localStorage from IndexedDB if LS is empty (Safari eviction). */
export async function hydrate() {
  for (const key of Object.values(STORE_KEYS)) {
    if (lsGet(key) != null) continue;
    const fromIdb = await idbGet(key);
    if (fromIdb != null) lsSet(key, fromIdb);
  }
}

export function getHeld() {
  return lsGet(STORE_KEYS.held);
}

export function setHeld(held) {
  lsSet(STORE_KEYS.held, held);
}

export function clearHeld() {
  lsRemove(STORE_KEYS.held);
}

export function getPending() {
  return lsGet(STORE_KEYS.pending) ?? [];
}

export function addPending(gift) {
  const pending = getPending();
  pending.push(gift);
  lsSet(STORE_KEYS.pending, pending);
}

export function removePending(id) {
  lsSet(
    STORE_KEYS.pending,
    getPending().filter((g) => g.id !== id),
  );
}

export function updatePending(id, patch) {
  lsSet(
    STORE_KEYS.pending,
    getPending().map((g) => (g.id === id ? { ...g, ...patch } : g)),
  );
}
