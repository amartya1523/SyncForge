import { Doc, type Op, type StateVector, isValidOp } from '@syncforge/crdt'
import {
  type Awareness,
  type Peer,
  ROLE_RANK,
  type Role,
  type ServerMsg,
  type UserInfo,
  type Version,
} from '@syncforge/sync/protocol'
import type { WebSocket } from 'ws'
import { newId } from './auth'
import type { Bus, BusEnvelope } from './bus/types'
import { config } from './config'
import type { DocMeta, Store } from './store/types'

export interface Conn {
  id: string
  ws: WebSocket
  user: UserInfo
  role: Role
  state: Awareness
}

export interface RoomDeps {
  store: Store
  bus: Bus
  serverId: string
}

const MAX_INSERT = 200_000
const MAX_SET_BYTES = 64 * 1024
const REMOTE_PEER_TTL = 45_000

export async function resolveRole(store: Store, meta: DocMeta, userId: string): Promise<Role | null> {
  if (meta.owner === userId) return 'owner'
  const member = await store.getMemberRole(meta.id, userId)
  if (member) return member
  return meta.linkRole === 'none' ? null : meta.linkRole
}

export function send(conn: Conn, msg: ServerMsg | string, lossy = false) {
  const ws = conn.ws
  if (ws.readyState !== ws.OPEN) return
  // presence is the first thing to go for a slow consumer; ops never are
  if (lossy && ws.bufferedAmount > 1 << 20) return
  if (ws.bufferedAmount > 32 << 20) {
    ws.terminate() // hopelessly behind: it'll reconnect and resync from its state vector
    return
  }
  ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
}

/**
 * One document, loaded in this process. The room's Doc is a full replica: it
 * serves state-vector diffs, is persisted, and relays ops. It never authors ops and
 * never resolves conflicts (there aren't any to resolve).
 */
export class Room {
  readonly doc = new Doc({ clientId: 'server' })
  readonly conns = new Map<string, Conn>()
  private remotePeers = new Map<string, Peer & { seen: number }>()
  private clients: Record<string, UserInfo> = {}
  private versions: Version[] = []
  meta!: DocMeta

  private unpersisted: Op[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private flushing: Promise<void> = Promise.resolve()
  private opsSinceSnapshot = 0
  private opsSinceVersion = 0
  private lastVersionAt = Date.now()
  private idleTimer: NodeJS.Timeout | null = null
  private sweepTimer: NodeJS.Timeout
  private metaTimer: NodeJS.Timeout | null = null
  private closed = false

  constructor(
    readonly id: string,
    private deps: RoomDeps,
    private onUnload: (room: Room) => void,
  ) {
    this.sweepTimer = setInterval(() => this.sweepRemotePeers(), 10_000)
  }

  /** Subscribe before loading: anything published in between is idempotent anyway. */
  async load(meta: DocMeta) {
    this.meta = meta
    await this.deps.bus.subscribe(this.id, (env) => this.onBus(env))
    this.doc.apply(await this.deps.store.loadOps(this.id))
    this.versions = await this.deps.store.listVersions(this.id)
    await this.loadClients(Object.keys(this.doc.stateVector()))
    this.deps.bus.publish(this.id, { k: 'hello' })
  }

  private async loadClients(clientIds: string[]) {
    const owners = await this.deps.store.clientOwners(clientIds)
    const users = await this.deps.store.getUsers([...new Set(Object.values(owners))])
    const byId = new Map(users.map((u) => [u.id, u]))
    for (const [client, uid] of Object.entries(owners)) {
      const u = byId.get(uid)
      if (u) this.clients[client] = u
    }
  }

  get title(): string {
    const t = this.doc.get('meta', 'doc')?.title
    return typeof t === 'string' && t.trim() ? t : this.meta.title
  }

  // ---------------------------------------------------------------- membership

  join(conn: Conn, clientSv: StateVector) {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.conns.set(conn.id, conn)

    const peers: Peer[] = []
    for (const c of this.conns.values()) if (c !== conn) peers.push(this.peerOf(c))
    for (const p of this.remotePeers.values()) peers.push(p)

    send(conn, {
      t: 'welcome',
      conn: conn.id,
      server: this.deps.serverId,
      role: conn.role,
      user: conn.user,
      title: this.title,
      sv: this.doc.stateVector(),
      ops: this.doc.diff(clientSv),
      peers,
      clients: this.clients,
      versions: this.versions,
    })
  }

  leave(conn: Conn) {
    if (!this.conns.delete(conn.id)) return
    this.broadcast({ t: 'leave', conn: conn.id })
    this.deps.bus.publish(this.id, { k: 'leave', conn: conn.id })
    if (!this.conns.size) this.idleTimer = setTimeout(() => void this.unload(), config.roomIdleMs)
  }

  private peerOf(c: Conn): Peer {
    return { conn: c.id, user: c.user, state: c.state, server: this.deps.serverId }
  }

  private broadcast(msg: ServerMsg, except?: Conn, lossy = false) {
    if (!this.conns.size) return
    const raw = JSON.stringify(msg)
    for (const c of this.conns.values()) if (c !== except) send(c, raw, lossy)
  }

  // ---------------------------------------------------------------- ops

  /** Returns an error string if the batch was rejected. */
  async receive(conn: Conn, ops: unknown[]): Promise<string | null> {
    if (!Array.isArray(ops) || !ops.length) return null
    if (ROLE_RANK[conn.role] < ROLE_RANK.commenter) return 'read_only'

    const clientIds = new Set<string>()
    for (const op of ops) {
      if (!isValidOp(op)) return 'bad_request'
      if (op.t === 'ins' && op.s.length > MAX_INSERT) return 'bad_request'
      if (op.t === 'set' && JSON.stringify(op.v).length > MAX_SET_BYTES) return 'bad_request'
      // commenters may write comments and nothing else
      if (conn.role === 'commenter' && !(op.t === 'set' && op.m === 'comments') && op.t !== 'gc') return 'read_only'
      clientIds.add(op.id.client)
    }

    // A client id belongs to whoever used it first. Rejecting everything else keeps
    // authorship ("blame", version authors) honest.
    const claimed: Record<string, UserInfo> = {}
    for (const client of clientIds) {
      const known = this.clients[client]
      if (known) {
        if (known.id !== conn.user.id) return 'forbidden'
        continue
      }
      const owner = await this.deps.store.claimClient(client, conn.user.id)
      if (owner !== conn.user.id) return 'forbidden'
      this.clients[client] = claimed[client] = conn.user
    }
    if (Object.keys(claimed).length) {
      this.broadcast({ t: 'clients', clients: claimed })
      this.deps.bus.publish(this.id, { k: 'clients', clients: claimed })
    }

    const applied = this.doc.apply(ops as Op[], conn.id)
    // only the sender's own entries matter to it; the full vector is O(clients) per keystroke
    const sv = this.doc.stateVector()
    const ack: StateVector = {}
    for (const c of clientIds) ack[c] = sv[c] ?? 0
    send(conn, { t: 'ack', sv: ack })
    if (!applied.length) return null

    // the sender already has its own ops, but not ops of others its batch unblocked
    const foreign = applied.filter((op) => !clientIds.has(op.id.client))
    if (foreign.length) send(conn, { t: 'ops', ops: foreign })
    this.broadcast({ t: 'ops', ops: applied }, conn)
    this.deps.bus.publish(this.id, { k: 'ops', ops: applied })
    this.persist(applied, conn.user)
    return null
  }

  syncFor(conn: Conn, sv: StateVector) {
    const ops = this.doc.diff(sv)
    if (ops.length) send(conn, { t: 'ops', ops })
    send(conn, { t: 'ack', sv: this.doc.stateVector() })
  }

  private persist(ops: Op[], author: UserInfo | null) {
    this.unpersisted.push(...ops)
    this.opsSinceSnapshot += ops.length
    this.opsSinceVersion += ops.length
    this.flushTimer ??= setTimeout(() => void this.flush(), 100)

    // keep the doc list's title / "edited" time fresh without a write per keystroke
    this.metaTimer ??= setTimeout(() => {
      this.metaTimer = null
      void this.deps.store.updateDoc(this.id, { title: this.title, updatedAt: Date.now() }).catch(() => {})
    }, 1000)

    if (this.opsSinceVersion >= 50 && Date.now() - this.lastVersionAt > config.autoVersionMs) {
      void this.createVersion('Autosave', author, true)
    }
  }

  async flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    const batch = this.unpersisted
    this.unpersisted = []
    this.flushing = this.flushing.then(async () => {
      try {
        if (batch.length) await this.deps.store.appendOps(this.id, batch)
        if (this.opsSinceSnapshot >= config.snapshotEvery) {
          this.opsSinceSnapshot = 0
          await this.deps.store.compact(this.id, this.doc.encode(), this.doc.stateVector())
        }
      } catch (err) {
        // the ops still live in memory and on clients; next handshake re-uploads them
        console.error(`[room ${this.id}] persist failed`, err)
        this.unpersisted.unshift(...batch)
      }
    })
    await this.flushing
  }

  // ---------------------------------------------------------------- versions

  async createVersion(name: string, author: UserInfo | null, auto = false) {
    this.lastVersionAt = Date.now()
    this.opsSinceVersion = 0
    const maps: Version['maps'] = {}
    for (const m of ['shapes', 'meta']) maps[m] = Object.fromEntries(this.doc.getMap(m))
    const text = this.doc.text()
    const v: Version = {
      id: newId('v'),
      docId: this.id,
      name: name.slice(0, 80) || 'Untitled version',
      auto,
      author,
      createdAt: Date.now(),
      sv: this.doc.stateVector(),
      maps,
      preview: text.slice(0, 160),
      chars: text.length,
    }
    await this.flush()
    await this.deps.store.addVersion(v)
    this.versions = [v, ...this.versions].slice(0, 200)
    this.broadcast({ t: 'versions', versions: this.versions })
    this.deps.bus.publish(this.id, { k: 'versions', versions: this.versions })
  }

  // ---------------------------------------------------------------- presence

  setAwareness(conn: Conn, state: Awareness) {
    conn.state = sanitizeAwareness(state)
    const peer = this.peerOf(conn)
    this.broadcast({ t: 'awareness', peer }, conn, true)
    this.deps.bus.publish(this.id, { k: 'awareness', peer })
  }

  private sweepRemotePeers() {
    const now = Date.now()
    for (const [id, p] of this.remotePeers) {
      if (now - p.seen > REMOTE_PEER_TTL) {
        this.remotePeers.delete(id)
        this.broadcast({ t: 'leave', conn: id })
      }
    }
  }

  // ---------------------------------------------------------------- access

  async recheckAccess() {
    const meta = await this.deps.store.getDoc(this.id)
    if (!meta) return
    this.meta = meta
    for (const c of this.conns.values()) {
      const role = await resolveRole(this.deps.store, meta, c.user.id)
      if (!role) {
        send(c, { t: 'error', code: 'forbidden', message: 'Your access to this document was removed' })
        c.ws.close()
      } else if (role !== c.role) {
        c.role = role
        send(c, { t: 'role', role })
      }
    }
  }

  // ---------------------------------------------------------------- cluster

  private onBus({ msg, from }: BusEnvelope) {
    switch (msg.k) {
      case 'ops': {
        const applied = this.doc.apply(msg.ops, 'bus')
        if (applied.length) this.broadcast({ t: 'ops', ops: applied })
        break
      }
      case 'awareness':
        this.remotePeers.set(msg.peer.conn, { ...msg.peer, server: from, seen: Date.now() })
        this.broadcast({ t: 'awareness', peer: msg.peer }, undefined, true)
        break
      case 'leave':
        if (this.remotePeers.delete(msg.conn)) this.broadcast({ t: 'leave', conn: msg.conn })
        break
      case 'hello':
        // a peer server just loaded the room: tell it who is connected here
        for (const c of this.conns.values()) this.deps.bus.publish(this.id, { k: 'awareness', peer: this.peerOf(c) })
        break
      case 'clients':
        Object.assign(this.clients, msg.clients)
        this.broadcast({ t: 'clients', clients: msg.clients })
        break
      case 'versions':
        this.versions = msg.versions
        this.broadcast({ t: 'versions', versions: msg.versions })
        break
      case 'access':
        void this.recheckAccess()
        break
    }
  }

  async unload() {
    if (this.closed || this.conns.size) return
    this.closed = true
    clearInterval(this.sweepTimer)
    if (this.metaTimer) clearTimeout(this.metaTimer)
    this.opsSinceSnapshot = Math.max(this.opsSinceSnapshot, 1)
    await this.flush()
    await this.deps.bus.unsubscribe(this.id).catch(() => {})
    this.onUnload(this)
  }

  /** for graceful shutdown */
  async close() {
    for (const c of this.conns.values()) c.ws.close(1012, 'server restarting')
    this.conns.clear()
    await this.unload()
  }
}

function sanitizeAwareness(s: Awareness): Awareness {
  if (!s || typeof s !== 'object') return {}
  const out: Awareness = {}
  if (s.view === 'doc' || s.view === 'board') out.view = s.view
  if (s.cursor && typeof s.cursor === 'object') out.cursor = s.cursor
  if (s.cursor === null) out.cursor = null
  if (s.pointer && Number.isFinite(s.pointer.x) && Number.isFinite(s.pointer.y)) out.pointer = { x: s.pointer.x, y: s.pointer.y }
  if (s.pointer === null) out.pointer = null
  out.typing = !!s.typing
  out.idle = !!s.idle
  return out
}
