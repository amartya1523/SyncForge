import { Doc, seededRandom, type Op } from '@syncforge/crdt'

/**
 * A tiny in-browser network: three replicas, each with its own Doc, talking over
 * links that can be slow, lossy, duplicating and partitioned. No server involved.
 */

export type ReplicaId = 'ada' | 'grace' | 'linus'

export interface ReplicaMeta {
  id: ReplicaId
  name: string
  short: string
  color: string
}

export const REPLICAS: ReplicaMeta[] = [
  { id: 'ada', name: 'Ada', short: 'A', color: '#ff6a3d' },
  { id: 'grace', name: 'Grace', short: 'G', color: '#5eead4' },
  { id: 'linus', name: 'Linus', short: 'L', color: '#a78bfa' },
]

export const REPLICA_BY_ID = Object.fromEntries(REPLICAS.map((r) => [r.id, r])) as Record<ReplicaId, ReplicaMeta>

/** client id of the doc that writes the shared starting text */
export const SEED_CLIENT = 'seed'
export const SEED_TEXT = 'HELLO'

export const COLORS = {
  flare: '#ffb547',
  tide: '#5eead4',
  danger: '#ff5c6c',
  faint: '#5d5d66',
}

export interface NetConfig {
  /** base one-way delay, ms */
  latency: number
  /** 0..100, how far each packet's delay may stray from the base */
  jitter: number
  /** 0..100, chance a packet never arrives */
  loss: number
  /** 0..100, chance a second copy is sent */
  dup: number
}

export const PRESETS: Record<'calm' | 'badWifi' | 'apocalypse', NetConfig> = {
  calm: { latency: 350, jitter: 10, loss: 0, dup: 0 },
  badWifi: { latency: 900, jitter: 60, loss: 15, dup: 10 },
  apocalypse: { latency: 2500, jitter: 100, loss: 40, dup: 40 },
}

export type PacketKind = 'op' | 'dup' | 'sync'

export interface Packet {
  id: number
  from: ReplicaId
  to: ReplicaId
  ops: Op[]
  kind: PacketKind
  /** total travel time; dropped packets die halfway */
  delay: number
  dropped: boolean
}

export type LogTone = 'op' | 'dup' | 'sync' | 'drop' | 'info'

export interface LogEntry {
  id: number
  at: number
  text: string
  tone: LogTone
}

export interface ReplicaStats {
  sent: number
  received: number
}

const LOG_LIMIT = 60
const ANTI_ENTROPY_EVERY = 3000
const DROP_FADE = 700

const WORDS = [
  'forge', 'merge', 'causal', 'tombstone', 'replica', 'clock', 'vector', 'ember', 'sync', 'packet',
  'latency', 'quorum', 'gossip', 'idempotent', 'offline', 'converge', 'delta', 'origin', 'anvil', 'spark',
]

const PAIRS: Array<[ReplicaId, ReplicaId]> = [
  ['ada', 'grace'],
  ['grace', 'linus'],
  ['linus', 'ada'],
]

export class NetworkSim {
  docs = {} as Record<ReplicaId, Doc>
  stats = {} as Record<ReplicaId, ReplicaStats>
  cut: Record<ReplicaId, boolean> = { ada: false, grace: false, linus: false }
  packets: Packet[] = []
  log: LogEntry[] = []
  config: NetConfig = { ...PRESETS.calm }
  antiEntropy = false
  chaos = false

  /** bumped (at most once per frame) whenever anything visible changes */
  version = 0

  private rand = seededRandom(0x5f0e)
  private startedAt = Date.now()
  private seq = 0
  private running = false
  private listeners = new Set<() => void>()
  private frame = 0
  private packetTimers = new Set<ReturnType<typeof setTimeout>>()
  private botTimers = new Map<ReplicaId, ReturnType<typeof setTimeout>>()
  private antiEntropyTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribers: Array<() => void> = []

  constructor() {
    this.reset(false)
  }

  // ------------------------------------------------------------ lifecycle

  start() {
    if (this.running) return
    this.running = true
    this.startedAt = Date.now()
    if (this.antiEntropy) this.startAntiEntropy()
    if (this.chaos) this.startBots()
  }

  stop() {
    this.running = false
    this.clearPacketTimers()
    this.packets = []
    this.stopAntiEntropy()
    this.stopBots()
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getVersion = () => this.version

  /** Coalesce bursts of changes into one React render per frame. */
  private notify() {
    if (!this.running) {
      this.version++
      return
    }
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.version++
      for (const fn of this.listeners) fn()
    })
  }

  /** Fresh docs that all start from the same seeded "HELLO", so they share item ids. */
  reset(announce = true) {
    this.clearPacketTimers()
    this.packets = []
    for (const off of this.unsubscribers) off()
    this.unsubscribers = []

    const base = new Doc({ clientId: SEED_CLIENT })
    base.insert(0, SEED_TEXT)
    const snapshot = base.encode()

    for (const r of REPLICAS) {
      const doc = new Doc({ clientId: r.id })
      doc.apply(snapshot)
      this.docs[r.id] = doc
      this.stats[r.id] = { sent: 0, received: 0 }
      this.unsubscribers.push(
        doc.on((e) => {
          if (e.local) this.broadcast(r.id, e.ops)
          this.notify()
        }),
      )
    }

    this.log = []
    if (announce) this.addLog('reset · three fresh replicas from the same seed', 'info')
    else this.addLog(`seeded "${SEED_TEXT}" on all replicas`, 'info')
    this.notify()
  }

  // ------------------------------------------------------------ controls

  setConfig(patch: Partial<NetConfig>) {
    this.config = { ...this.config, ...patch }
    this.notify()
  }

  setCut(id: ReplicaId, value: boolean) {
    if (this.cut[id] === value) return
    this.cut = { ...this.cut, [id]: value }
    const name = REPLICA_BY_ID[id].name
    this.addLog(value ? `${name} cable cut · partitioned` : `${name} reconnected`, value ? 'drop' : 'info')
    this.notify()
  }

  setAntiEntropy(on: boolean) {
    this.antiEntropy = on
    if (on) this.startAntiEntropy()
    else this.stopAntiEntropy()
    this.addLog(on ? 'auto anti-entropy on (every 3s)' : 'auto anti-entropy off', 'info')
    this.notify()
  }

  setChaos(on: boolean) {
    this.chaos = on
    if (on) this.startBots()
    else this.stopBots()
    this.addLog(on ? 'chaos bots released' : 'chaos bots stopped', 'info')
    this.notify()
  }

  /**
   * One anti-entropy round: every replica sends each peer the ops that peer is
   * missing (diff against its state vector). In a real system the peer would
   * send its state vector first; here we read it directly to save a round trip.
   */
  syncNow(manual = true) {
    let sent = 0
    for (const [a, b] of PAIRS) {
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const ops = this.docs[from].diff(this.docs[to].stateVector())
        if (!ops.length) continue
        this.send(from, to, ops, 'sync')
        sent++
      }
    }
    if (manual && sent === 0) this.addLog('sync · everyone already has everything', 'sync')
    this.notify()
  }

  // ------------------------------------------------------------ derived state

  get inFlight(): number {
    let n = 0
    for (const p of this.packets) if (!p.dropped) n++
    return n
  }

  get converged(): boolean {
    if (this.inFlight > 0) return false
    const prints = REPLICAS.map((r) => this.docs[r.id])
    if (prints.some((d) => d.pendingCount > 0)) return false
    const first = prints[0].fingerprint()
    return prints.every((d) => d.fingerprint() === first)
  }

  // ------------------------------------------------------------ the network

  private broadcast(from: ReplicaId, ops: Op[]) {
    for (const r of REPLICAS) {
      if (r.id === from) continue
      this.send(from, r.id, ops, 'op')
      if (this.rand() * 100 < this.config.dup) this.send(from, r.id, ops, 'dup')
    }
  }

  private travelTime(): number {
    const { latency, jitter } = this.config
    // jitter 100% means anywhere between 0 and 2x the base latency
    const spread = latency * (jitter / 100)
    const delay = latency + (this.rand() * 2 - 1) * spread
    return Math.max(40, Math.round(delay))
  }

  private send(from: ReplicaId, to: ReplicaId, ops: Op[], kind: PacketKind) {
    const partitioned = this.cut[from] || this.cut[to]
    const lost = partitioned || this.rand() * 100 < this.config.loss
    const packet: Packet = { id: ++this.seq, from, to, ops, kind, delay: this.travelTime(), dropped: lost }
    this.packets.push(packet)
    this.stats[from].sent++

    if (lost) {
      const reason = partitioned ? 'cable cut' : 'lost'
      this.later(() => {
        this.addLog(`${this.route(packet)}  ${describe(packet)}  dropped (${reason})`, 'drop')
        this.notify()
      }, packet.delay / 2)
      this.later(() => this.removePacket(packet), packet.delay / 2 + DROP_FADE)
    } else {
      this.later(() => this.deliver(packet), packet.delay)
    }
    this.notify()
  }

  private deliver(packet: Packet) {
    this.removePacket(packet)
    // the cable may have been cut while the packet was on the wire
    if (this.cut[packet.from] || this.cut[packet.to]) {
      this.addLog(`${this.route(packet)}  ${describe(packet)}  dropped (cable cut)`, 'drop')
      return
    }

    const doc = this.docs[packet.to]
    const pendingBefore = doc.pendingCount
    const applied = doc.apply(packet.ops)
    this.stats[packet.to].received++

    const notes: string[] = []
    if (packet.kind === 'dup') notes.push('dup')
    if (doc.pendingCount > pendingBefore) notes.push('out of order, buffered')
    else if (!applied.length) notes.push('already had it')
    else if (pendingBefore > 0 && doc.pendingCount < pendingBefore) notes.push('unblocked buffer')

    const tone: LogTone = packet.kind === 'sync' ? 'sync' : packet.kind === 'dup' ? 'dup' : 'op'
    this.addLog(`${this.route(packet)}  ${describe(packet)}${notes.length ? `  (${notes.join(', ')})` : ''}`, tone)
  }

  private removePacket(packet: Packet) {
    const i = this.packets.indexOf(packet)
    if (i !== -1) {
      this.packets.splice(i, 1)
      this.notify()
    }
  }

  private route(p: Packet) {
    return `${REPLICA_BY_ID[p.from].name} → ${REPLICA_BY_ID[p.to].name}`
  }

  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.packetTimers.delete(t)
      fn()
    }, ms)
    this.packetTimers.add(t)
  }

  private clearPacketTimers() {
    for (const t of this.packetTimers) clearTimeout(t)
    this.packetTimers.clear()
  }

  private addLog(text: string, tone: LogTone) {
    this.log.push({ id: ++this.seq, at: Date.now() - this.startedAt, text, tone })
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT)
  }

  // ------------------------------------------------------------ background work

  private startAntiEntropy() {
    if (!this.running || this.antiEntropyTimer) return
    this.antiEntropyTimer = setInterval(() => this.syncNow(false), ANTI_ENTROPY_EVERY)
  }

  private stopAntiEntropy() {
    if (this.antiEntropyTimer) clearInterval(this.antiEntropyTimer)
    this.antiEntropyTimer = null
  }

  private startBots() {
    if (!this.running) return
    for (const r of REPLICAS) if (!this.botTimers.has(r.id)) this.scheduleBot(r.id)
  }

  private stopBots() {
    for (const t of this.botTimers.values()) clearTimeout(t)
    this.botTimers.clear()
  }

  private scheduleBot(id: ReplicaId) {
    const wait = 400 + Math.random() * 500
    this.botTimers.set(
      id,
      setTimeout(() => {
        this.botEdit(id)
        this.scheduleBot(id)
      }, wait),
    )
  }

  /** Type a word at a word boundary, or occasionally delete a few characters. */
  private botEdit(id: ReplicaId) {
    const doc = this.docs[id]
    const len = doc.length
    const shouldDelete = len > 140 || (len > 6 && Math.random() < 0.3)

    if (shouldDelete) {
      const count = 1 + Math.floor(Math.random() * 4)
      const at = Math.floor(Math.random() * len)
      doc.delete(at, Math.min(count, len - at))
      return
    }

    const text = doc.text()
    const boundaries = [0, len]
    for (let i = 0; i < text.length; i++) if (text[i] === ' ') boundaries.push(i + 1)
    const at = boundaries[Math.floor(Math.random() * boundaries.length)]
    const word = WORDS[Math.floor(Math.random() * WORDS.length)]
    doc.insert(at, at === len ? ` ${word}` : `${word} `)
  }
}

/** Short human summary of what a packet carries. */
function describe(p: Packet): string {
  if (p.kind === 'sync') return `sync ${p.ops.length} op${p.ops.length === 1 ? '' : 's'}`
  if (p.ops.length !== 1) return `${p.ops.length} ops`
  const op = p.ops[0]
  if (op.t === 'ins') {
    const s = op.s.replace(/\n/g, '↵')
    return `ins '${s.length > 14 ? s.slice(0, 13) + '…' : s}'`
  }
  if (op.t === 'del') return `del ${op.d.reduce((n, [, , len]) => n + len, 0)}`
  return op.t
}

export function shortPrint(fp: string): string {
  return fp.slice(0, 6)
}

export function formatAt(ms: number): string {
  const s = Math.max(0, ms) / 1000
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
