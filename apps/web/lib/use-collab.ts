'use client'

import { Doc, type Op, type StateVector, UndoManager } from '@syncforge/crdt'
import { type Peer, type Role, type Status, SyncProvider, type UserInfo, type Version } from '@syncforge/sync'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { wsUrl } from './config'
import { loadLocal, saveLocal } from './offline'
import type { Session } from './session'

export interface Collab {
  doc: Doc
  undo: UndoManager
  provider: SyncProvider | null
  status: Status
  role: Role | null
  peers: Peer[]
  clients: Record<string, UserInfo>
  versions: Version[]
  pending: number
  server: string | null
  error: string | null
  /** true once the IndexedDB copy (if any) has been applied */
  ready: boolean
}

type TabMsg = { t: 'ops'; ops: Op[] } | { t: 'hello'; sv: StateVector }

/**
 * One document, three ways to stay in sync:
 *   1. IndexedDB – opens instantly and survives closing the tab while offline
 *   2. the sync server over WebSocket
 *   3. other tabs of this browser via BroadcastChannel (works with no network at all)
 */
export function useCollab(docId: string, session: Session | null | undefined): Collab {
  const doc = useMemo(() => new Doc(), [docId])
  const undo = useMemo(() => new UndoManager(doc), [doc])
  const [provider, setProvider] = useState<SyncProvider | null>(null)
  const [ready, setReady] = useState(false)
  const [, force] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    let p: SyncProvider | null = null
    const rerender = () => force((n) => n + 1)

    let saveTimer: ReturnType<typeof setTimeout> | null = null
    const save = () => {
      saveTimer = null
      void saveLocal(docId, doc.encode())
    }
    const offSave = doc.on(() => {
      saveTimer ??= setTimeout(save, 400)
    })

    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('syncforge:' + docId) : null
    const offTab = doc.on((e) => {
      if (e.local) bc?.postMessage({ t: 'ops', ops: e.ops } satisfies TabMsg)
    })
    if (bc) {
      bc.onmessage = (ev: MessageEvent<TabMsg>) => {
        const m = ev.data
        if (m.t === 'ops') doc.apply(m.ops, 'remote-tab')
        else if (m.t === 'hello') {
          const missing = doc.diff(m.sv)
          if (missing.length) bc.postMessage({ t: 'ops', ops: missing } satisfies TabMsg)
        }
      }
    }

    ;(async () => {
      const local = await loadLocal(docId)
      if (cancelled) return
      if (local) doc.apply(local, 'idb')
      setReady(true)
      bc?.postMessage({ t: 'hello', sv: doc.stateVector() } satisfies TabMsg)

      p = new SyncProvider({ url: wsUrl(), docId, token: session.token, doc })
      for (const ev of ['status', 'peers', 'clients', 'versions', 'role', 'pending', 'title'] as const) p.on(ev, rerender)
      p.on('error', (e) => {
        if (e.code !== 'rate_limited') setError(e.message)
        rerender()
      })
      setProvider(p)
    })()

    const flush = () => {
      if (saveTimer) clearTimeout(saveTimer)
      save()
    }
    window.addEventListener('pagehide', flush)

    return () => {
      cancelled = true
      window.removeEventListener('pagehide', flush)
      flush()
      offSave()
      offTab()
      bc?.close()
      p?.destroy()
      setProvider(null)
    }
  }, [doc, docId, session])

  useEffect(() => () => undo.destroy(), [undo])

  return {
    doc,
    undo,
    provider,
    status: provider?.status ?? 'connecting',
    role: provider?.role ?? null,
    peers: provider ? [...provider.peers.values()] : [],
    clients: provider?.clients ?? {},
    versions: provider?.versions ?? [],
    pending: provider?.pendingCount ?? 0,
    server: provider?.server ?? null,
    error,
    ready,
  }
}

/**
 * Re-render when the doc changes. `which` narrows it to text or a given map so the
 * whiteboard doesn't re-render on every keystroke in the editor and vice versa.
 */
export function useDocVersion(doc: Doc, which: 'text' | 'any' | string = 'any'): number {
  const store = useMemo(() => {
    let v = 0
    return {
      subscribe(cb: () => void) {
        let raf = 0
        const off = doc.on((e) => {
          const hit = which === 'any' || (which === 'text' ? e.textChanged : e.mapsChanged.has(which))
          if (!hit) return
          v++
          // coalesce bursts (a big sync) into one render per frame
          if (!raf) raf = requestAnimationFrame(() => ((raf = 0), cb()))
        })
        return () => {
          off()
          cancelAnimationFrame(raf)
        }
      },
      get: () => v,
    }
  }, [doc, which])
  return useSyncExternalStore(store.subscribe, store.get, () => 0)
}
