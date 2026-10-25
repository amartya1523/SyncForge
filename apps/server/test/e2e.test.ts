import { Doc, type Op } from '@syncforge/crdt'
import { SyncProvider } from '@syncforge/sync'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { LocalBus } from '../src/bus/local'
import type { Bus, BusEnvelope, BusMsg } from '../src/bus/types'
import { MemoryStore } from '../src/store/memory'

/** in-process stand-in for Redis so two app instances can share rooms in a test */
class Hub {
  private subs = new Map<string, Array<{ server: string; fn: (e: BusEnvelope) => void }>>()
  bus(server: string): Bus {
    return {
      publish: (room: string, msg: BusMsg) => {
        const env: BusEnvelope = JSON.parse(JSON.stringify({ room, from: server, msg }))
        for (const s of this.subs.get(room) ?? []) if (s.server !== server) queueMicrotask(() => s.fn(env))
      },
      subscribe: async (room, fn) => {
        this.subs.set(room, [...(this.subs.get(room) ?? []), { server, fn }])
      },
      unsubscribe: async (room) => {
        this.subs.set(room, (this.subs.get(room) ?? []).filter((s) => s.server !== server))
      },
      close: async () => {},
    }
  }
}

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function boot(store = new MemoryStore(), bus: Bus = new LocalBus(), serverId = 's1') {
  const app = createApp({ store, bus, serverId })
  const port = await app.listen(0)
  cleanups.push(() => app.close())
  const base = `http://localhost:${port}`
  return { app, store, port, base, ws: `ws://localhost:${port}/ws` }
}

async function api<T>(base: string, path: string, opts: { token?: string; method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(base + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: 'Bearer ' + opts.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json as T
}

async function signIn(base: string, name: string) {
  return api<{ token: string; user: { id: string } }>(base, '/api/session', { body: { name } })
}

function client(ws: string, docId: string, token: string, doc = new Doc()) {
  const p = new SyncProvider({ url: ws, docId, token, doc })
  cleanups.push(() => p.destroy())
  return p
}

async function until(cond: () => boolean, ms = 3000) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition')
    await new Promise((r) => setTimeout(r, 10))
  }
}

async function setup() {
  const srv = await boot()
  const alice = await signIn(srv.base, 'Alice')
  const { doc } = await api<{ doc: { id: string } }>(srv.base, '/api/docs', { token: alice.token, body: { title: 'Spec' } })
  return { ...srv, alice, docId: doc.id }
}

describe('server end to end', () => {
  it('two users converge through the server', async () => {
    const { ws, base, alice, docId } = await setup()
    const bob = await signIn(base, 'Bob')
    const a = client(ws, docId, alice.token)
    const b = client(ws, docId, bob.token)
    await until(() => a.status === 'online' && b.status === 'online')

    a.doc.insert(0, 'Hello')
    await until(() => b.doc.text() === 'Hello')
    b.doc.insert(5, ' world')
    a.doc.insert(0, '> ')
    await until(() => a.doc.text() === b.doc.text() && a.doc.text().length === 13)
    expect(a.doc.text()).toBe('> Hello world')
    await until(() => a.pendingCount === 0 && b.pendingCount === 0)
  })

  it('offline edits are uploaded on reconnect and merged', async () => {
    const { ws, base, alice, docId } = await setup()
    const bob = await signIn(base, 'Bob')
    const a = client(ws, docId, alice.token)
    const b = client(ws, docId, bob.token)
    await until(() => a.status === 'online' && b.status === 'online')
    a.doc.insert(0, 'base text')
    await until(() => b.doc.text() === 'base text')

    b.disconnect()
    b.doc.insert(0, 'offline-')
    a.doc.insert(a.doc.length, ' +online')
    expect(b.pendingCount).toBeGreaterThan(0)

    b.connect()
    await until(() => a.doc.text() === b.doc.text() && a.doc.text().includes('offline-'))
    expect(a.doc.text()).toBe('offline-base text +online')
    await until(() => b.pendingCount === 0)
  })

  it('persists across room unload and server restart', async () => {
    const store = new MemoryStore()
    const s1 = await boot(store)
    const alice = await signIn(s1.base, 'Alice')
    const { doc } = await api<{ doc: { id: string } }>(s1.base, '/api/docs', { token: alice.token, body: {} })
    const a = client(s1.ws, doc.id, alice.token)
    await until(() => a.status === 'online')
    a.doc.insert(0, 'durable')
    await until(() => a.pendingCount === 0)
    a.destroy()
    await s1.app.close()

    const s2 = await boot(store)
    const fresh = client(s2.ws, doc.id, alice.token)
    await until(() => fresh.doc.text() === 'durable')
  })

  it('viewers cannot edit, commenters can only comment', async () => {
    const { ws, base, alice, docId } = await setup()
    await api(base, `/api/docs/${docId}`, { token: alice.token, method: 'PATCH', body: { linkRole: 'viewer' } })
    const { token: invite } = await api<{ token: string }>(base, `/api/docs/${docId}/invites`, {
      token: alice.token,
      body: { role: 'commenter' },
    })

    const viewer = await signIn(base, 'Vic')
    const commenter = await signIn(base, 'Cam')
    await api(base, '/api/invites/accept', { token: commenter.token, body: { token: invite } })

    const owner = client(ws, docId, alice.token)
    const v = client(ws, docId, viewer.token)
    const c = client(ws, docId, commenter.token)
    await until(() => [owner, v, c].every((p) => p.status === 'online'))
    expect(v.role).toBe('viewer')
    expect(c.role).toBe('commenter')

    const errors: string[] = []
    v.on('error', (e) => errors.push(e.code))
    c.on('error', (e) => errors.push(e.code))

    v.doc.insert(0, 'vandalism')
    c.doc.insert(0, 'also no')
    await until(() => errors.length >= 2)
    expect(errors).toEqual(['read_only', 'read_only'])

    const c2 = client(ws, docId, commenter.token)
    await until(() => c2.status === 'online')
    c2.doc.set('comments', 'k1', { text: 'looks good' })
    await until(() => owner.doc.get('comments', 'k1')?.text === 'looks good')
    expect(owner.doc.text()).toBe('')
  })

  it('downgrades a live connection when the owner changes access', async () => {
    const { ws, base, alice, docId } = await setup()
    const bob = await signIn(base, 'Bob')
    const b = client(ws, docId, bob.token)
    await until(() => b.status === 'online')
    expect(b.role).toBe('editor')
    await api(base, `/api/docs/${docId}`, { token: alice.token, method: 'PATCH', body: { linkRole: 'viewer' } })
    await until(() => b.role === 'viewer')
    await api(base, `/api/docs/${docId}`, { token: alice.token, method: 'PATCH', body: { linkRole: 'none' } })
    await until(() => b.status === 'denied')
  })

  it("rejects ops forged under someone else's client id", async () => {
    const { ws, base, alice, docId } = await setup()
    const a = client(ws, docId, alice.token)
    await until(() => a.status === 'online')
    a.doc.insert(0, 'real')
    await until(() => a.pendingCount === 0)

    const mallory = await signIn(base, 'Mallory')
    const sock = new WebSocket(ws)
    const replies: Array<{ t: string; code?: string }> = []
    sock.onmessage = (e) => replies.push(JSON.parse(String(e.data)))
    await new Promise((r) => (sock.onopen = r))
    sock.send(JSON.stringify({ t: 'hello', doc: docId, token: mallory.token, sv: {} }))
    await until(() => replies.some((m) => m.t === 'welcome'))
    const forged: Op = { t: 'ins', id: { client: a.doc.clientId, clock: 4 }, o: null, r: null, s: 'fake' }
    sock.send(JSON.stringify({ t: 'ops', ops: [forged] }))
    await until(() => replies.some((m) => m.t === 'error'))
    expect(replies.find((m) => m.t === 'error')?.code).toBe('forbidden')
    expect(a.doc.text()).toBe('real')
    sock.close()
  })

  it('refuses bad tokens and unknown documents', async () => {
    const { ws, docId, alice } = await setup()
    const bad = client(ws, docId, 'nope.nope')
    const missing = client(ws, 'doesnotexist', alice.token)
    await until(() => bad.status === 'denied' && missing.status === 'denied')
  })

  it('a restore merges with concurrent edits over the network', async () => {
    const { ws, base, alice, docId } = await setup()
    const bob = await signIn(base, 'Bob')
    const a = client(ws, docId, alice.token)
    const b = client(ws, docId, bob.token)
    await until(() => a.status === 'online' && b.status === 'online')

    a.doc.insert(0, 'Good intro.')
    await until(() => b.doc.text() === 'Good intro.')
    a.createVersion('v1')
    await until(() => a.versions.length === 1)
    a.doc.delete(0, 5)
    a.doc.insert(0, 'Bad ')
    await until(() => b.doc.text() === 'Bad intro.')

    b.disconnect()
    b.doc.insert(b.doc.length, ' Bob was here.')
    a.doc.restoreText(a.versions[0].sv)
    b.connect()
    await until(() => a.doc.text() === b.doc.text() && b.doc.text().includes('Good'))
    expect(a.doc.text()).toBe('Good intro. Bob was here.')
  })
})

describe('horizontal scaling', () => {
  it('users on different servers share a room through the bus', async () => {
    const store = new MemoryStore()
    const hub = new Hub()
    const s1 = await boot(store, hub.bus('s1'), 's1')
    const s2 = await boot(store, hub.bus('s2'), 's2')
    const alice = await signIn(s1.base, 'Alice')
    const bob = await signIn(s2.base, 'Bob')
    const { doc } = await api<{ doc: { id: string } }>(s1.base, '/api/docs', { token: alice.token, body: {} })

    const a = client(s1.ws, doc.id, alice.token)
    const b = client(s2.ws, doc.id, bob.token)
    await until(() => a.status === 'online' && b.status === 'online')
    expect(a.server).toBe('s1')
    expect(b.server).toBe('s2')

    for (let i = 0; i < 20; i++) {
      a.doc.insert(a.doc.length, 'a')
      b.doc.insert(0, 'b')
    }
    await until(() => a.doc.text() === b.doc.text() && a.doc.length === 40)
    // presence crosses servers too
    a.setAwareness({ view: 'doc', typing: true })
    await until(() => [...b.peers.values()].some((p) => p.user.name === 'Alice'))
  })
})
