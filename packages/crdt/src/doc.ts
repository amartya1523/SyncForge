import {
  type DelOp,
  type DeleteRange,
  type ID,
  type InsOp,
  type Op,
  type SetOp,
  type StateVector,
  compressIds,
  expandRanges,
  idKey,
  opLength,
  sameId,
} from './types'
import { randomClientId } from './random'

/** One character in the sequence. Deleted characters stay as tombstones. */
export class Item {
  left: Item | null = null
  right: Item | null = null
  /** ids of every delete op that removed this char; null while visible */
  deletedBy: ID[] | null = null

  constructor(
    readonly id: ID,
    readonly char: string,
    readonly origin: Item | null,
    readonly rightOrigin: Item | null,
  ) {}

  get deleted(): boolean {
    return this.deletedBy !== null
  }
}

interface FieldValue {
  v: unknown
  lt: number
  client: string
  op: string
}

export interface UpdateEvent {
  ops: Op[]
  local: boolean
  origin: unknown
  textChanged: boolean
  mapsChanged: Set<string>
}

export type Entry = Record<string, unknown>

export interface DocOptions {
  clientId?: string
  /** ops waiting for missing dependencies; extra ones are dropped and re-synced later */
  maxPending?: number
}

/** Position "just after this character". `null` means the start of the document. */
export interface RelativePosition {
  id: ID | null
}

export interface Anchor {
  start: ID
  end: ID
}

export class Doc {
  readonly clientId: string

  private head: Item | null = null
  private items = new Map<string, Item>()
  /** old char id -> the char that re-created it (see InsOp.rv) */
  private revivedAs = new Map<string, Item>()
  private visible = 0

  /** every op in the order it was integrated, so any slice of it is causally ordered */
  private history: Op[] = []
  private sv: StateVector = {}
  private pending: Op[] = []
  private maxPending: number

  private maps = new Map<string, Map<string, Map<string, FieldValue>>>()
  /** set-op key -> how many fields it still wins. 0 means it can be compacted */
  private liveFields = new Map<string, number>()
  private lamport = 0

  private listeners = new Set<(e: UpdateEvent) => void>()
  private textCache: string | null = ''
  /** last looked-up (item, visible index); only valid until the next change */
  private marker: { item: Item; index: number } | null = null
  private mapCache = new Map<string, Map<string, Entry>>()

  private txn: { ops: Op[]; text: boolean; maps: Set<string>; origin: unknown } | null = null

  constructor(opts: DocOptions = {}) {
    this.clientId = opts.clientId ?? randomClientId()
    this.maxPending = opts.maxPending ?? 50_000
  }

  // ---------------------------------------------------------------- events

  on(fn: (e: UpdateEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(e: UpdateEvent) {
    for (const fn of this.listeners) fn(e)
  }

  /** Group several local changes into one update event (one network message, one undo step). */
  transact<T>(fn: () => T, origin: unknown = null): T {
    if (this.txn) return fn()
    this.txn = { ops: [], text: false, maps: new Set(), origin }
    try {
      return fn()
    } finally {
      const t = this.txn
      this.txn = null
      if (t.ops.length) {
        this.emit({ ops: t.ops, local: true, origin: t.origin, textChanged: t.text, mapsChanged: t.maps })
      }
    }
  }

  // ---------------------------------------------------------------- text reads

  get length(): number {
    return this.visible
  }

  text(): string {
    if (this.textCache !== null) return this.textCache
    let s = ''
    for (let it = this.head; it; it = it.right) if (!it.deleted) s += it.char
    this.textCache = s
    return s
  }

  /** visible text split into runs by author, for "blame" rendering */
  runs(): Array<{ client: string; text: string }> {
    const out: Array<{ client: string; text: string }> = []
    for (let it = this.head; it; it = it.right) {
      if (it.deleted) continue
      const last = out[out.length - 1]
      if (last && last.client === it.id.client) last.text += it.char
      else out.push({ client: it.id.client, text: it.char })
    }
    return out
  }

  private visibleAt(index: number): Item {
    if (index < 0 || index >= this.visible) throw new RangeError(`index ${index} out of range (length ${this.visible})`)
    // People type where they just typed, so start from the last position we looked up
    // instead of the head. Turns sequential typing from O(n) into ~O(1).
    let it: Item | null = this.head
    let i = 0
    const m = this.marker
    if (m && !m.item.deleted && Math.abs(m.index - index) < index) {
      it = m.item
      i = m.index
    }
    while (i > index && it) {
      it = it.left
      if (it && !it.deleted) i--
    }
    for (; it; it = it.right) {
      if (it.deleted) continue
      if (i === index) {
        this.marker = { item: it, index }
        return it
      }
      i++
    }
    throw new Error('sequence corrupted: visible count out of sync')
  }

  /** number of visible characters before `item` */
  private indexOf(item: Item): number {
    let i = 0
    for (let it = this.head; it && it !== item; it = it.right) if (!it.deleted) i++
    return i
  }

  // ---------------------------------------------------------------- text writes

  insert(index: number, s: string): InsOp | null {
    if (!s) return null
    if (index < 0 || index > this.visible) throw new RangeError(`insert at ${index}, length ${this.visible}`)
    const left = index === 0 ? null : this.visibleAt(index - 1)
    const op = this.insertBetween(left, left ? left.right : this.head, s)
    const last = this.items.get(op.id.client + ':' + (op.id.clock + s.length - 1))!
    this.marker = { item: last, index: index + s.length - 1 }
    return op
  }

  delete(index: number, len: number): DelOp | null {
    if (len <= 0 || index >= this.visible) return null
    const before = index > 0 ? this.visibleAt(index - 1) : null
    const doomed: Item[] = []
    for (let it: Item | null = this.visibleAt(index); it && doomed.length < len; it = it.right) {
      if (!it.deleted) doomed.push(it)
    }
    const op = this.deleteItems(doomed)
    if (before) this.marker = { item: before, index: index - 1 }
    return op
  }

  private insertBetween(left: Item | null, right: Item | null, s: string, rv?: DeleteRange[]): InsOp {
    const op: InsOp = { t: 'ins', id: this.nextId(), o: left ? left.id : null, r: right ? right.id : null, s }
    if (rv) op.rv = rv
    this.commitLocal(op)
    return op
  }

  private deleteItems(doomed: Item[]): DelOp | null {
    const d: DeleteRange[] = []
    for (const it of doomed) {
      if (it.deleted) continue
      const last = d[d.length - 1]
      if (last && last[0] === it.id.client && last[1] + last[2] === it.id.clock) last[2]++
      else d.push([it.id.client, it.id.clock, 1])
    }
    if (!d.length) return null
    const op: DelOp = { t: 'del', id: this.nextId(), d }
    this.commitLocal(op)
    return op
  }

  private nextId(): ID {
    return { client: this.clientId, clock: this.sv[this.clientId] ?? 0 }
  }

  private commitLocal(op: Op) {
    const changed = this.integrate(op)
    if (this.txn) {
      this.txn.ops.push(op)
      this.txn.text ||= changed.text
      if (changed.map) this.txn.maps.add(changed.map)
    } else {
      this.emit({
        ops: [op],
        local: true,
        origin: null,
        textChanged: changed.text,
        mapsChanged: new Set(changed.map ? [changed.map] : []),
      })
    }
  }

  // ---------------------------------------------------------------- maps

  set(map: string, key: string, fields: Entry): SetOp {
    const op: SetOp = { t: 'set', id: this.nextId(), lt: ++this.lamport, m: map, k: key, v: fields }
    this.commitLocal(op)
    return op
  }

  getMap(name: string): Map<string, Entry> {
    const cached = this.mapCache.get(name)
    if (cached) return cached
    const out = new Map<string, Entry>()
    const m = this.maps.get(name)
    if (m) {
      for (const [key, fields] of m) {
        const e: Entry = {}
        for (const [f, fv] of fields) e[f] = fv.v
        out.set(key, e)
      }
    }
    this.mapCache.set(name, out)
    return out
  }

  get(map: string, key: string): Entry | undefined {
    return this.getMap(map).get(key)
  }

  mapNames(): string[] {
    return [...this.maps.keys()]
  }

  // ---------------------------------------------------------------- sync

  stateVector(): StateVector {
    return { ...this.sv }
  }

  get pendingCount(): number {
    return this.pending.length
  }

  /**
   * Ops the owner of `remote` is missing, in causal order. Runs of typed characters
   * are merged back into one op and overwritten map writes shrink to `gc` stubs, so
   * this doubles as the compact snapshot format (`diff({})`).
   */
  diff(remote: StateVector = {}): Op[] {
    const out: Op[] = []
    const lastGc = new Map<string, number>()
    for (const raw of this.history) {
      const op = trimKnown(raw, remote[raw.id.client] ?? 0)
      if (!op) continue
      const c = op.id.client

      if (op.t === 'set' && this.liveFields.get(idKey(op.id)) === 0) {
        const at = lastGc.get(c)
        const prev = at === undefined ? undefined : out[at]
        if (prev && prev.t === 'gc' && prev.id.clock + prev.len === op.id.clock) prev.len++
        else {
          lastGc.set(c, out.length)
          out.push({ t: 'gc', id: op.id, len: 1 })
        }
        continue
      }

      const prev = out[out.length - 1]
      if (
        op.t === 'ins' &&
        !op.rv &&
        prev &&
        prev.t === 'ins' &&
        !prev.rv &&
        prev.id.client === c &&
        prev.id.clock + prev.s.length === op.id.clock &&
        sameId(op.o, { client: c, clock: op.id.clock - 1 }) &&
        sameId(op.r, prev.r)
      ) {
        out[out.length - 1] = { ...prev, s: prev.s + op.s }
        continue
      }
      out.push(op.t === 'ins' ? { ...op } : op)
    }
    return out
  }

  /** Full state as a list of ops. `new Doc().apply(doc.encode())` reproduces it. */
  encode(): Op[] {
    return this.diff({})
  }

  /**
   * Apply ops from anywhere: duplicates are ignored, ops whose dependencies have
   * not arrived yet are parked until they do.
   */
  apply(ops: Op[], origin: unknown = null): Op[] {
    const applied: Op[] = []
    let text = false
    const maps = new Set<string>()
    const run = (op: Op): boolean => {
      const o = trimKnown(op, this.sv[op.id.client] ?? 0)
      if (!o) return true
      if (!this.ready(o)) return false
      const changed = this.integrate(o)
      text ||= changed.text
      if (changed.map) maps.add(changed.map)
      applied.push(o)
      return true
    }

    for (const op of ops) {
      if (!isValidOp(op)) continue
      if (!run(op)) this.pending.push(op)
    }

    let progress = applied.length > 0
    while (progress && this.pending.length) {
      progress = false
      const still: Op[] = []
      for (const op of this.pending) {
        const before = applied.length
        if (!run(op)) still.push(op)
        else if (applied.length > before) progress = true
      }
      this.pending = still
    }
    if (this.pending.length > this.maxPending) this.pending.length = this.maxPending

    if (applied.length) this.emit({ ops: applied, local: false, origin, textChanged: text, mapsChanged: maps })
    return applied
  }

  private known(id: ID | null): boolean {
    return id === null || this.items.has(idKey(id))
  }

  private ready(op: Op): boolean {
    if (op.id.clock !== (this.sv[op.id.client] ?? 0)) return false
    if (op.t === 'ins') return this.known(op.o) && this.known(op.r)
    if (op.t === 'del') return op.d.every(([c, k, n]) => (this.sv[c] ?? 0) >= k + n)
    return true
  }

  private integrate(op: Op): { text: boolean; map: string | null } {
    let text = false
    let map: string | null = null

    switch (op.t) {
      case 'ins': {
        const right = op.r ? this.items.get(idKey(op.r))! : null
        let origin = op.o ? this.items.get(idKey(op.o))! : null
        const revives = op.rv ? expandRanges(op.rv) : null
        for (let k = 0; k < op.s.length; k++) {
          const item = new Item({ client: op.id.client, clock: op.id.clock + k }, op.s[k], origin, right)
          this.integrateItem(item)
          if (revives?.[k]) this.revivedAs.set(idKey(revives[k]), item)
          origin = item
        }
        text = true
        break
      }
      case 'del': {
        for (const [c, k, n] of op.d) {
          for (let clock = k; clock < k + n; clock++) {
            const it = this.items.get(c + ':' + clock)
            if (!it) continue
            if (it.deletedBy) it.deletedBy.push(op.id)
            else {
              it.deletedBy = [op.id]
              this.visible--
              text = true
            }
          }
        }
        break
      }
      case 'set': {
        this.integrateSet(op)
        map = op.m
        break
      }
      case 'gc':
        break
    }

    this.history.push(op)
    this.sv[op.id.client] = op.id.clock + opLength(op)
    if (text) {
      this.textCache = null
      this.marker = null
    }
    return { text, map }
  }

  /**
   * YATA integration. Starting right after the left origin, walk the items that sit
   * between our two origins and decide, for each, whether it belongs before us.
   * Concurrent siblings (same left origin) are ordered by client id; items whose
   * origin lies inside the scanned region belong to a sibling's subtree and are
   * skipped together with it. Every replica runs the same scan over the same
   * items and therefore picks the same spot.
   */
  private integrateItem(item: Item) {
    let left = item.origin
    let o = left ? left.right : this.head
    const conflicting = new Set<Item>()
    const beforeOrigin = new Set<Item>()

    while (o && o !== item.rightOrigin) {
      beforeOrigin.add(o)
      conflicting.add(o)
      if (o.origin === item.origin) {
        if (o.id.client < item.id.client) {
          left = o
          conflicting.clear()
        } else if (o.rightOrigin === item.rightOrigin) {
          break
        }
      } else if (o.origin && beforeOrigin.has(o.origin)) {
        if (!conflicting.has(o.origin)) {
          left = o
          conflicting.clear()
        }
      } else {
        break
      }
      o = o.right
    }

    item.left = left
    item.right = left ? left.right : this.head
    if (item.right) item.right.left = item
    if (left) left.right = item
    else this.head = item

    this.items.set(idKey(item.id), item)
    this.visible++
  }

  private integrateSet(op: SetOp) {
    this.lamport = Math.max(this.lamport, op.lt)
    const key = idKey(op.id)
    let m = this.maps.get(op.m)
    if (!m) this.maps.set(op.m, (m = new Map()))
    let entry = m.get(op.k)
    if (!entry) m.set(op.k, (entry = new Map()))

    let wins = 0
    for (const f of Object.keys(op.v)) {
      const cur = entry.get(f)
      if (!cur || op.lt > cur.lt || (op.lt === cur.lt && op.id.client > cur.client)) {
        if (cur) this.liveFields.set(cur.op, this.liveFields.get(cur.op)! - 1)
        entry.set(f, { v: op.v[f], lt: op.lt, client: op.id.client, op: key })
        wins++
      }
    }
    this.liveFields.set(key, wins)
    this.mapCache.delete(op.m)
  }

  // ---------------------------------------------------------------- positions

  relativePosition(index: number): RelativePosition {
    if (index <= 0) return { id: null }
    return { id: this.visibleAt(Math.min(index, this.visible) - 1).id }
  }

  /** A deleted char that was later re-created (undo, restore) stands in for its copy. */
  private follow(item: Item): Item {
    let cur = item
    for (let next = this.revivedAs.get(idKey(cur.id)); cur.deleted && next; next = this.revivedAs.get(idKey(cur.id))) cur = next
    return cur
  }

  /** null if the char it points at hasn't reached this replica yet */
  resolvePosition(pos: RelativePosition): number | null {
    if (!pos.id) return 0
    const found = this.items.get(idKey(pos.id))
    if (!found) return null
    const item = this.follow(found)
    return this.indexOf(item) + (item.deleted ? 0 : 1)
  }

  /** Anchor a range [from, to) to the characters themselves (used for comments). */
  anchor(from: number, to: number): Anchor | null {
    if (to <= from) return null
    return { start: this.visibleAt(from).id, end: this.visibleAt(to - 1).id }
  }

  /** null when the anchored text has been deleted entirely */
  resolveAnchor(a: Anchor): { from: number; to: number } | null {
    const s0 = this.items.get(idKey(a.start))
    const e0 = this.items.get(idKey(a.end))
    if (!s0 || !e0) return null
    const start = this.follow(s0)
    const end = this.follow(e0)
    const from = this.indexOf(start)
    const to = this.indexOf(end) + (end.deleted ? 0 : 1)
    return to > from ? { from, to } : null
  }

  // ---------------------------------------------------------------- history

  /** The document text as it was when the replica had exactly the ops in `sv`. */
  textAt(sv: StateVector): string {
    let s = ''
    for (let it = this.head; it; it = it.right) if (visibleAt(it, sv)) s += it.char
    return s
  }

  /**
   * Compare the current text with the text at `sv`. Because deleted chars are kept
   * as tombstones this is exact and needs no diff algorithm: each char is either in
   * both, only now (added since), or only then (removed since).
   */
  compare(sv: StateVector): Array<{ text: string; kind: 'same' | 'added' | 'removed' }> {
    const out: Array<{ text: string; kind: 'same' | 'added' | 'removed' }> = []
    for (let it = this.head; it; it = it.right) {
      const then = visibleAt(it, sv)
      const now = !it.deleted
      if (!then && !now) continue
      const kind = then && now ? 'same' : now ? 'added' : 'removed'
      const last = out[out.length - 1]
      if (last && last.kind === kind) last.text += it.char
      else out.push({ text: it.char, kind })
    }
    return out
  }

  /**
   * Make the text look like it did at `sv`, using new ops only. Nothing is rewound:
   * chars added since are deleted, chars removed since are re-inserted right after
   * their own tombstones. Concurrent edits by others merge as usual.
   */
  restoreText(sv: StateVector) {
    const remove: Item[] = []
    const revive = new Set<Item>()
    for (let it = this.head; it; it = it.right) {
      const then = visibleAt(it, sv)
      if (!it.deleted && !then) remove.push(it)
      else if (it.deleted && then) revive.add(it)
    }
    this.transact(() => {
      this.deleteItems(remove)
      this.revive(revive)
    }, 'restore')
  }

  /** @internal re-insert the content of tombstoned items next to them; returns [old id, new id] pairs */
  revive(targets: Set<Item>): Array<[ID, ID]> {
    const groups: Item[][] = []
    let group: Item[] = []
    for (let it = this.head; it; it = it.right) {
      if (targets.has(it)) group.push(it)
      else if (!it.deleted && group.length) {
        groups.push(group)
        group = []
      }
    }
    if (group.length) groups.push(group)

    const pairs: Array<[ID, ID]> = []
    for (const g of groups) {
      const last = g[g.length - 1]
      const op = this.insertBetween(last, last.right, g.map((it) => it.char).join(''), compressIds(g.map((it) => it.id)))
      g.forEach((it, k) => pairs.push([it.id, { client: op.id.client, clock: op.id.clock + k }]))
    }
    return pairs
  }

  /** @internal */
  itemsById(ids: ID[]): Item[] {
    const out: Item[] = []
    for (const id of ids) {
      const it = this.items.get(idKey(id))
      if (it) out.push(it)
    }
    return out
  }

  /** @internal */
  removeItems(items: Item[]) {
    return this.deleteItems(items)
  }

  /** @internal */
  indexOfItem(item: Item) {
    return this.indexOf(item)
  }

  /** Debug view of the raw sequence, tombstones included (used by the Network Lab). */
  inspect(): Array<{ id: ID; char: string; deleted: boolean; origin: ID | null }> {
    const out = []
    for (let it = this.head; it; it = it.right) {
      out.push({ id: it.id, char: it.char, deleted: it.deleted, origin: it.origin?.id ?? null })
    }
    return out
  }

  /** Cheap fingerprint of the user-visible state; equal on converged replicas. */
  fingerprint(): string {
    const parts = [this.text()]
    for (const name of [...this.maps.keys()].sort()) {
      const m = this.getMap(name)
      for (const k of [...m.keys()].sort()) parts.push(name + '/' + k + '=' + stableStringify(m.get(k)))
    }
    return fnv1a(parts.join('\u0000'))
  }
}

function visibleAt(it: Item, sv: StateVector): boolean {
  if ((sv[it.id.client] ?? 0) <= it.id.clock) return false
  return !it.deletedBy?.some((d) => (sv[d.client] ?? 0) > d.clock)
}

/** Drop the part of `op` a replica already has (expected next clock = `next`). */
function trimKnown(op: Op, next: number): Op | null {
  const len = opLength(op)
  if (op.id.clock + len <= next) return null
  if (op.id.clock >= next) return op
  const cut = next - op.id.clock
  const id = { client: op.id.client, clock: next }
  if (op.t === 'ins') {
    const sliced: InsOp = { t: 'ins', id, o: { client: op.id.client, clock: next - 1 }, r: op.r, s: op.s.slice(cut) }
    if (op.rv) sliced.rv = compressIds(expandRanges(op.rv).slice(cut))
    return sliced
  }
  if (op.t === 'gc') return { t: 'gc', id, len: op.len - cut }
  return null
}

function isId(x: unknown): x is ID {
  const id = x as ID
  return !!id && typeof id.client === 'string' && Number.isInteger(id.clock) && id.clock >= 0
}

/** Shape check for ops coming off the wire. Semantics are checked by `ready`. */
export function isValidOp(op: unknown): op is Op {
  const o = op as Op
  if (!o || typeof o !== 'object' || !isId(o.id)) return false
  switch (o.t) {
    case 'ins':
      return (
        typeof o.s === 'string' &&
        o.s.length > 0 &&
        (o.o === null || isId(o.o)) &&
        (o.r === null || isId(o.r)) &&
        (o.rv === undefined || (Array.isArray(o.rv) && o.rv.every((r) => Array.isArray(r) && typeof r[0] === 'string' && Number.isInteger(r[1]) && r[2] > 0)))
      )
    case 'del':
      return (
        Array.isArray(o.d) &&
        o.d.length > 0 &&
        o.d.every((r) => Array.isArray(r) && typeof r[0] === 'string' && Number.isInteger(r[1]) && r[2] > 0)
      )
    case 'set':
      return typeof o.m === 'string' && typeof o.k === 'string' && Number.isFinite(o.lt) && !!o.v && typeof o.v === 'object'
    case 'gc':
      return Number.isInteger(o.len) && o.len > 0
    default:
      return false
  }
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined'
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const o = v as Record<string, unknown>
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
