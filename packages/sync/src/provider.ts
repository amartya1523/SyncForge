import { type Doc, type Op, type StateVector, opLength, svDiffCount, svMerge } from '@syncforge/crdt'
import {
  type Awareness,
  type ClientMsg,
  type ErrorCode,
  MAX_OPS_PER_MESSAGE,
  type Peer,
  type Role,
  type ServerMsg,
  type UserInfo,
  type Version,
} from './protocol'

export type Status = 'connecting' | 'online' | 'offline' | 'denied'

export interface ProviderOptions {
  url: string
  docId: string
  token: string
  doc: Doc
  /** pass `ws` in Node < 22; defaults to the global WebSocket */
  WebSocket?: typeof WebSocket
  connect?: boolean
}

interface Events {
  status: Status
  peers: Map<string, Peer>
  clients: Record<string, UserInfo>
  versions: Version[]
  role: Role | null
  pending: number
  title: string
  error: { code: ErrorCode; message: string }
}

type Listener<K extends keyof Events> = (v: Events[K]) => void

const HEARTBEAT_MS = 15_000
const PONG_TIMEOUT_MS = 8_000
const ANTI_ENTROPY_MS = 20_000

/**
 * Keeps one Doc in sync with the server over a WebSocket.
 *
 * Handshake: we send our state vector, the server answers with the ops we lack plus
 * its own vector, and we upload whatever *it* lacks. After that, local ops are
 * streamed in small batches. Acks carry the server's state vector, which gives us
 * an exact "N changes not saved yet" count and lets us re-send anything that got
 * lost (rate limiting, a server crash between broadcast and persist, ...).
 */
export class SyncProvider {
  status: Status = 'offline'
  role: Role | null = null
  user: UserInfo | null = null
  conn: string | null = null
  server: string | null = null
  title = ''
  serverSv: StateVector = {}
  peers = new Map<string, Peer>()
  clients: Record<string, UserInfo> = {}
  versions: Version[] = []

  private ws: WebSocket | null = null
  private WS: typeof WebSocket
  private wantOnline = false
  private synced = false
  private attempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private outbox: Op[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private repairTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private lastSync = 0
  private awareness: Awareness = {}
  private awarenessTimer: ReturnType<typeof setTimeout> | null = null
  private lastAwareness = 0
  private listeners = new Map<keyof Events, Set<Listener<never>>>()
  private offDoc: () => void

  constructor(private opts: ProviderOptions) {
    this.WS = opts.WebSocket ?? globalThis.WebSocket
    this.offDoc = opts.doc.on((e) => {
      if (e.local && this.synced) this.queue(e.ops)
      this.emit('pending', this.pendingCount)
    })
    if (opts.connect !== false) this.connect()
  }

  get doc() {
    return this.opts.doc
  }

  /** local changes the server hasn't acknowledged yet */
  get pendingCount() {
    return svDiffCount(this.doc.stateVector(), this.serverSv)
  }

  get canEdit() {
    return this.role === 'editor' || this.role === 'owner'
  }

  on<K extends keyof Events>(event: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(fn as Listener<never>)
    return () => set!.delete(fn as Listener<never>)
  }

  private emit<K extends keyof Events>(event: K, value: Events[K]) {
    for (const fn of this.listeners.get(event) ?? []) (fn as Listener<K>)(value)
  }

  private setStatus(s: Status) {
    if (this.status === s) return
    this.status = s
    this.emit('status', s)
  }

  // ------------------------------------------------------------ lifecycle

  connect() {
    this.wantOnline = true
    if (!this.ws) this.open()
  }

  /** go offline on purpose (also used by the "simulate offline" switch) */
  disconnect() {
    this.wantOnline = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.ws?.close()
    this.cleanupSocket()
    this.setStatus('offline')
  }

  destroy() {
    this.disconnect()
    this.offDoc()
    this.listeners.clear()
  }

  private open() {
    this.setStatus('connecting')
    const ws = new this.WS(this.opts.url)
    this.ws = ws
    ws.onopen = () => {
      // token goes in the first frame rather than the URL so it never lands in access logs
      this.send({ t: 'hello', doc: this.opts.docId, token: this.opts.token, sv: this.doc.stateVector() })
    }
    ws.onmessage = (ev) => {
      try {
        this.handle(JSON.parse(String(ev.data)) as ServerMsg)
      } catch (err) {
        console.error('[syncforge] bad message', err)
      }
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.cleanupSocket()
      if (this.wantOnline && this.status !== 'denied') this.scheduleReconnect()
      else if (this.status !== 'denied') this.setStatus('offline')
    }
    ws.onerror = () => ws.close()
  }

  private cleanupSocket() {
    this.ws = null
    this.synced = false
    this.outbox = []
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.pongTimer) clearTimeout(this.pongTimer)
    if (this.flushTimer) clearTimeout(this.flushTimer)
    if (this.repairTimer) clearTimeout(this.repairTimer)
    this.heartbeat = this.pongTimer = this.flushTimer = this.repairTimer = null
    if (this.peers.size) {
      this.peers.clear()
      this.emit('peers', this.peers)
    }
  }

  private scheduleReconnect() {
    this.setStatus('connecting')
    // exponential backoff with full jitter, so a restarted server isn't stampeded
    const cap = Math.min(10_000, 400 * 2 ** this.attempts++)
    const delay = Math.random() * cap
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.wantOnline && !this.ws) this.open()
    }, delay)
  }

  private send(msg: ClientMsg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg))
  }

  // ------------------------------------------------------------ incoming

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome': {
        this.attempts = 0
        this.conn = msg.conn
        this.server = msg.server
        this.user = msg.user
        this.title = msg.title
        this.clients = msg.clients
        this.versions = msg.versions
        this.peers = new Map(msg.peers.map((p) => [p.conn, p]))
        this.serverSv = msg.sv
        if (this.role !== msg.role) {
          this.role = msg.role
          this.emit('role', msg.role)
        }
        this.doc.apply(msg.ops, 'server')
        this.synced = true
        this.setStatus('online')
        // upload everything we did while away
        this.sendOps(this.doc.diff(this.serverSv))
        this.send({ t: 'awareness', state: this.awareness })
        this.startHeartbeat()
        this.emit('peers', this.peers)
        this.emit('clients', this.clients)
        this.emit('versions', this.versions)
        this.emit('title', this.title)
        this.emit('pending', this.pendingCount)
        break
      }
      case 'ops': {
        for (const op of msg.ops) {
          const end = op.id.clock + opLength(op)
          if ((this.serverSv[op.id.client] ?? 0) < end) this.serverSv[op.id.client] = end
        }
        this.doc.apply(msg.ops, 'server')
        break
      }
      case 'ack':
        this.serverSv = svMerge(this.serverSv, msg.sv)
        this.emit('pending', this.pendingCount)
        this.scheduleRepair()
        break
      case 'awareness':
        this.peers.set(msg.peer.conn, msg.peer)
        this.emit('peers', this.peers)
        break
      case 'leave':
        if (this.peers.delete(msg.conn)) this.emit('peers', this.peers)
        break
      case 'clients':
        this.clients = { ...this.clients, ...msg.clients }
        this.emit('clients', this.clients)
        break
      case 'versions':
        this.versions = msg.versions
        this.emit('versions', msg.versions)
        break
      case 'role':
        this.role = msg.role
        this.emit('role', msg.role)
        break
      case 'error':
        this.emit('error', { code: msg.code, message: msg.message })
        if (msg.code === 'unauthorized' || msg.code === 'forbidden' || msg.code === 'not_found') {
          this.wantOnline = false
          this.setStatus('denied')
          this.ws?.close()
        }
        break
      case 'pong':
        if (this.pongTimer) clearTimeout(this.pongTimer)
        this.pongTimer = null
        break
    }
  }

  private startHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = setInterval(() => {
      this.send({ t: 'ping' })
      // browsers can't see TCP pings; if the server goes quiet, assume a dead link
      this.pongTimer ??= setTimeout(() => this.ws?.close(), PONG_TIMEOUT_MS)
      if (Date.now() - this.lastSync > ANTI_ENTROPY_MS) {
        this.lastSync = Date.now()
        this.send({ t: 'sync', sv: this.doc.stateVector() })
      }
    }, HEARTBEAT_MS)
  }

  // ------------------------------------------------------------ outgoing

  private queue(ops: Op[]) {
    this.outbox.push(...ops)
    this.flushTimer ??= setTimeout(() => {
      this.flushTimer = null
      const batch = this.outbox
      this.outbox = []
      this.sendOps(batch)
    }, 16)
  }

  private sendOps(ops: Op[]) {
    for (let i = 0; i < ops.length; i += MAX_OPS_PER_MESSAGE) {
      this.send({ t: 'ops', ops: ops.slice(i, i + MAX_OPS_PER_MESSAGE) })
    }
  }

  /** If an ack shows the server is still missing something, re-send it after a quiet moment. */
  private scheduleRepair() {
    if (this.repairTimer) clearTimeout(this.repairTimer)
    this.repairTimer = setTimeout(() => {
      this.repairTimer = null
      if (this.synced && !this.outbox.length && this.pendingCount > 0) this.sendOps(this.doc.diff(this.serverSv))
    }, 1500)
  }

  setAwareness(patch: Awareness) {
    this.awareness = { ...this.awareness, ...patch }
    if (this.awarenessTimer) return
    // cursors are cheap to lose and expensive to flood: max ~20 updates/s
    const wait = Math.max(0, 50 - (Date.now() - this.lastAwareness))
    this.awarenessTimer = setTimeout(() => {
      this.awarenessTimer = null
      this.lastAwareness = Date.now()
      if (this.synced) this.send({ t: 'awareness', state: this.awareness })
    }, wait)
  }

  createVersion(name: string) {
    this.send({ t: 'version', name })
  }
}
