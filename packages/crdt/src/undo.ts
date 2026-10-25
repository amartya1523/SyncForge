import type { Doc, Item } from './doc'
import { type ID, type Op, idKey } from './types'

interface Step {
  /** chars this step inserted (undo deletes them) */
  ins: ID[]
  /** chars this step deleted (undo brings them back) */
  del: ID[]
  at: number
}

/**
 * Undo that only touches *your own* edits. The native textarea undo would happily
 * revert a colleague's sentence, because it only sees the textarea value.
 * Undo/redo are themselves new ops, so they merge like any other edit.
 */
export class UndoManager {
  private undoStack: Step[] = []
  private redoStack: Step[] = []
  private busy = false
  private off: () => void
  /** undo/redo re-create chars under new ids; older steps still name the old ones */
  private alias = new Map<string, ID>()

  constructor(
    private doc: Doc,
    private opts: { captureMs?: number; limit?: number } = {},
  ) {
    this.off = doc.on((e) => {
      if (!e.local || this.busy || e.origin === 'remote-tab') return
      this.record(e.ops)
    })
  }

  get canUndo() {
    return this.undoStack.length > 0
  }

  get canRedo() {
    return this.redoStack.length > 0
  }

  destroy() {
    this.off()
  }

  private record(ops: Op[]) {
    const ins: ID[] = []
    const del: ID[] = []
    for (const op of ops) {
      if (op.t === 'ins') for (let k = 0; k < op.s.length; k++) ins.push({ client: op.id.client, clock: op.id.clock + k })
      if (op.t === 'del') for (const [client, clock, n] of op.d) for (let k = 0; k < n; k++) del.push({ client, clock: clock + k })
    }
    if (!ins.length && !del.length) return

    const now = Date.now()
    const last = this.undoStack[this.undoStack.length - 1]
    if (last && now - last.at < (this.opts.captureMs ?? 500)) {
      last.ins.push(...ins)
      last.del.push(...del)
      last.at = now
    } else {
      this.undoStack.push({ ins, del, at: now })
      if (this.undoStack.length > (this.opts.limit ?? 200)) this.undoStack.shift()
    }
    this.redoStack = []
  }

  /** Returns a caret index near the change, or null if there was nothing to undo. */
  undo(): number | null {
    return this.pop(this.undoStack, this.redoStack)
  }

  redo(): number | null {
    return this.pop(this.redoStack, this.undoStack)
  }

  private latest = (id: ID): ID => {
    let cur = id
    for (let next = this.alias.get(idKey(cur)); next; next = this.alias.get(idKey(cur))) cur = next
    return cur
  }

  private pop(from: Step[], to: Step[]): number | null {
    const step = from.pop()
    if (!step) return null
    this.busy = true
    try {
      let caret: Item | null = null
      const revived = this.doc.transact(() => {
        const inserted = this.doc.itemsById(step.ins.map(this.latest)).filter((it) => !it.deleted)
        if (inserted.length) caret = inserted[0]
        this.doc.removeItems(inserted)
        const pairs = this.doc.revive(new Set(this.doc.itemsById(step.del.map(this.latest)).filter((it) => it.deleted)))
        for (const [from, to] of pairs) this.alias.set(idKey(from), to)
        const last = pairs.length ? this.doc.itemsById([pairs[pairs.length - 1][1]])[0] : undefined
        if (last) caret = last
        return pairs.map((p) => p[1])
      }, 'undo')
      to.push({ ins: revived, del: step.ins, at: 0 })
      if (!caret) return null
      const item: Item = caret
      return this.doc.indexOfItem(item) + (item.deleted ? 0 : 1)
    } finally {
      this.busy = false
    }
  }
}
