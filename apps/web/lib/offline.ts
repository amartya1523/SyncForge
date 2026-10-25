import type { Op } from '@syncforge/crdt'

/**
 * IndexedDB copy of each document, so it opens instantly and keeps working with no
 * network. We store the compact encoded state (not an op log): small, and merging a
 * stale copy with fresh server state is just `doc.apply`.
 */
const DB = 'syncforge'
const STORE = 'docs'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

let dbp: Promise<IDBDatabase> | null = null
const db = () => (dbp ??= open())

export async function loadLocal(docId: string): Promise<Op[] | null> {
  try {
    const d = await db()
    return await new Promise((resolve, reject) => {
      const req = d.transaction(STORE).objectStore(STORE).get(docId)
      req.onsuccess = () => resolve((req.result as Op[]) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function saveLocal(docId: string, ops: Op[]) {
  try {
    const d = await db()
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(ops, docId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // private mode / quota: offline copy is a nice-to-have, never fatal
  }
}
