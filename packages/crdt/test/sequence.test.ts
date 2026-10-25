import { describe, expect, it } from 'vitest'
import { Doc, type Op, UndoManager, diffText } from '../src'

/** collect every op a doc produces locally */
function recorder(doc: Doc) {
  const ops: Op[] = []
  doc.on((e) => {
    if (e.local) ops.push(...e.ops)
  })
  return ops
}

function syncAll(...docs: Doc[]) {
  for (const a of docs) for (const b of docs) if (a !== b) b.apply(a.diff(b.stateVector()))
}

describe('sequence basics', () => {
  it('inserts and deletes locally', () => {
    const d = new Doc({ clientId: 'a' })
    d.insert(0, 'hello')
    d.insert(5, ' world')
    d.delete(0, 1)
    d.insert(0, 'H')
    expect(d.text()).toBe('Hello world')
    expect(d.length).toBe(11)
  })

  it('rejects out of range inserts', () => {
    const d = new Doc()
    expect(() => d.insert(2, 'x')).toThrow(RangeError)
  })

  it('round-trips through encode()', () => {
    const d = new Doc({ clientId: 'a' })
    d.insert(0, 'abcdef')
    d.delete(2, 2)
    d.insert(1, 'XY')
    const copy = new Doc({ clientId: 'b' })
    copy.apply(d.encode())
    expect(copy.text()).toBe(d.text())
    expect(copy.stateVector()).toEqual(d.stateVector())
  })

  it('merges typed characters back into one op when encoding', () => {
    const d = new Doc({ clientId: 'a' })
    for (const ch of 'hello world') d.insert(d.length, ch)
    const enc = d.encode()
    expect(enc).toHaveLength(1)
    expect(enc[0]).toMatchObject({ t: 'ins', s: 'hello world' })
  })
})

describe('the HELLO example from the brief', () => {
  it('A appends WORLD while B inserts "Y " -> both converge', () => {
    const base = new Doc({ clientId: 'base' })
    base.insert(0, 'HELLO')

    const a = new Doc({ clientId: 'a' })
    const b = new Doc({ clientId: 'b' })
    a.apply(base.encode())
    b.apply(base.encode())

    a.insert(5, ' WORLD')
    b.insert(2, 'Y ')
    expect(a.text()).toBe('HELLO WORLD')
    expect(b.text()).toBe('HEY LLO')

    syncAll(a, b)
    expect(a.text()).toBe('HEY LLO WORLD')
    expect(b.text()).toBe('HEY LLO WORLD')
  })
})

describe('concurrency', () => {
  it('orders concurrent inserts at the same spot identically everywhere', () => {
    const a = new Doc({ clientId: 'a' })
    const b = new Doc({ clientId: 'b' })
    const c = new Doc({ clientId: 'c' })
    a.insert(0, 'X')
    b.insert(0, 'Y')
    c.insert(0, 'Z')
    syncAll(a, b, c)
    expect(a.text()).toBe(b.text())
    expect(b.text()).toBe(c.text())
    expect(a.text().split('').sort().join('')).toBe('XYZ')
  })

  it('does not interleave two words typed at the same position', () => {
    const a = new Doc({ clientId: 'a' })
    const b = new Doc({ clientId: 'b' })
    a.insert(0, '[]')
    b.apply(a.encode())
    for (const ch of 'HELLO') a.insert(a.length - 1, ch)
    for (const ch of 'WORLD') b.insert(b.length - 1, ch)
    syncAll(a, b)
    expect(['[HELLOWORLD]', '[WORLDHELLO]']).toContain(a.text())
    expect(b.text()).toBe(a.text())
  })

  it('keeps an insert made inside a range someone else deleted', () => {
    const a = new Doc({ clientId: 'a' })
    a.insert(0, 'the quick brown fox')
    const b = new Doc({ clientId: 'b' })
    b.apply(a.encode())

    b.delete(4, 'quick brown '.length) // B removes "quick brown "
    a.insert(10, 'very ') // A types inside it: "the quick very brown fox"

    syncAll(a, b)
    expect(a.text()).toBe('the very fox')
    expect(b.text()).toBe('the very fox')
  })

  it('handles two users deleting the same characters', () => {
    const a = new Doc({ clientId: 'a' })
    a.insert(0, 'abcdef')
    const b = new Doc({ clientId: 'b' })
    b.apply(a.encode())
    a.delete(1, 3)
    b.delete(2, 3)
    syncAll(a, b)
    expect(a.text()).toBe('af')
    expect(b.text()).toBe('af')
    expect(a.length).toBe(2)
  })
})

describe('unreliable delivery', () => {
  it('buffers ops whose dependencies have not arrived', () => {
    const a = new Doc({ clientId: 'a' })
    const ops = recorder(a)
    a.insert(0, 'abc')
    a.insert(3, 'def')
    a.delete(1, 1)

    const b = new Doc({ clientId: 'b' })
    b.apply([ops[2]])
    b.apply([ops[1]])
    expect(b.text()).toBe('')
    expect(b.pendingCount).toBe(2)
    b.apply([ops[0]])
    expect(b.text()).toBe('acdef')
    expect(b.pendingCount).toBe(0)
  })

  it('ignores duplicates, including partially overlapping runs', () => {
    const a = new Doc({ clientId: 'a' })
    for (const ch of 'abcdef') a.insert(a.length, ch)
    const b = new Doc({ clientId: 'b' })
    const all = a.encode() // one merged run "abcdef"
    b.apply(a.diff({}).map((op) => ({ ...op })).slice(0, 1))
    b.apply(all)
    b.apply(all)
    expect(b.text()).toBe('abcdef')

    const c = new Doc({ clientId: 'c' })
    c.apply(a.diff({ a: 3 })) // only "def": must wait for "abc"
    expect(c.text()).toBe('')
    c.apply(a.encode()) // full run overlapping what is pending
    expect(c.text()).toBe('abcdef')
  })

  it('drops malformed ops instead of crashing', () => {
    const d = new Doc()
    d.apply([{ t: 'ins', id: { client: 'x', clock: 0 }, o: null, r: null, s: '' } as Op])
    d.apply([{ t: 'nope' } as unknown as Op])
    d.apply([{ t: 'ins', id: { client: 'x', clock: -1 }, o: null, r: null, s: 'a' } as Op])
    expect(d.text()).toBe('')
  })
})

describe('relative positions and comment anchors', () => {
  it('a cursor follows its character when text is inserted before it', () => {
    const a = new Doc({ clientId: 'a' })
    a.insert(0, 'hello world')
    const pos = a.relativePosition(6) // before "world"
    const b = new Doc({ clientId: 'b' })
    b.apply(a.encode())
    b.insert(0, '>>> ')
    a.apply(b.diff(a.stateVector()))
    expect(a.resolvePosition(pos)).toBe(10)
  })

  it('an anchor survives edits and reports when its text is gone', () => {
    const a = new Doc({ clientId: 'a' })
    a.insert(0, 'one two three')
    const anchor = a.anchor(4, 7)! // "two"
    a.insert(0, 'zero ')
    let r = a.resolveAnchor(anchor)!
    expect(a.text().slice(r.from, r.to)).toBe('two')

    a.insert(12, 'o') // "twoo": typed after the anchor, not part of it
    r = a.resolveAnchor(anchor)!
    expect(a.text().slice(r.from, r.to)).toBe('two')

    a.delete(r.from, 4)
    expect(a.resolveAnchor(anchor)).toBeNull()
  })
})

describe('version history', () => {
  it('reads the text at any past state vector', () => {
    const d = new Doc({ clientId: 'a' })
    d.insert(0, 'draft one')
    const v1 = d.stateVector()
    d.delete(0, 5)
    d.insert(0, 'final')
    expect(d.textAt(v1)).toBe('draft one')
    expect(d.textAt({})).toBe('')
    expect(d.textAt(d.stateVector())).toBe(d.text())
  })

  it('compares any version with now, char by char', () => {
    const d = new Doc({ clientId: 'a' })
    d.insert(0, 'the cat sat')
    const v1 = d.stateVector()
    d.delete(4, 3)
    d.insert(4, 'dog')
    expect(d.compare(v1)).toEqual([
      { text: 'the ', kind: 'same' },
      { text: 'dog', kind: 'added' },
      { text: 'cat', kind: 'removed' },
      { text: ' sat', kind: 'same' },
    ])
  })

  it('comment anchors and cursors follow text brought back by a restore, on every replica', () => {
    const a = new Doc({ clientId: 'a' })
    a.insert(0, 'keep the quick brown fox')
    const v1 = a.stateVector()
    const anchor = a.anchor(9, 20)! // "quick brown"
    const caret = a.relativePosition(15) // inside "quick brown"
    a.delete(9, 12)
    expect(a.resolveAnchor(anchor)).toBeNull()

    a.restoreText(v1)
    const r = a.resolveAnchor(anchor)!
    expect(a.text().slice(r.from, r.to)).toBe('quick brown')
    expect(a.resolvePosition(caret)).toBe(15)

    const b = new Doc({ clientId: 'b' })
    b.apply(a.encode())
    const rb = b.resolveAnchor(anchor)!
    expect(b.text().slice(rb.from, rb.to)).toBe('quick brown')
  })

  it('restore is a forward edit and keeps concurrent work', () => {
    const e = new Doc({ clientId: 'e' })
    e.insert(0, 'Intro. Body.')
    const v1 = e.stateVector()
    e.delete(0, 7) // "Body."
    e.insert(e.length, ' Bad edit.')

    const a = new Doc({ clientId: 'a' })
    a.apply(e.encode())

    a.insert(a.length, ' A was here.') // concurrent with the restore
    e.restoreText(v1)
    expect(e.text()).toBe('Intro. Body.')

    syncAll(a, e)
    expect(a.text()).toBe(e.text())
    expect(a.text()).toContain('Intro. Body.')
    expect(a.text()).toContain(' A was here.')
    expect(a.text()).not.toContain('Bad edit')
  })
})

describe('undo', () => {
  it('only undoes your own edits', () => {
    const a = new Doc({ clientId: 'a' })
    const b = new Doc({ clientId: 'b' })
    const undo = new UndoManager(a, { captureMs: 0 })

    a.insert(0, 'mine ')
    b.apply(a.encode())
    b.insert(b.length, 'theirs')
    a.apply(b.diff(a.stateVector()))
    expect(a.text()).toBe('mine theirs')

    undo.undo()
    expect(a.text()).toBe('theirs')
    undo.redo()
    expect(a.text()).toBe('mine theirs')
  })

  it('undoes a delete by re-inserting the text in place', () => {
    const a = new Doc({ clientId: 'a' })
    const undo = new UndoManager(a, { captureMs: 0 })
    a.insert(0, 'keep this')
    a.delete(4, 5)
    expect(a.text()).toBe('keep')
    expect(undo.undo()).toBe(9)
    expect(a.text()).toBe('keep this')
    undo.undo()
    expect(a.text()).toBe('')
    undo.redo()
    undo.redo()
    expect(a.text()).toBe('keep')
  })

  it('follows re-created characters across several undo steps', () => {
    const a = new Doc({ clientId: 'a' })
    const undo = new UndoManager(a, { captureMs: 0 })
    a.insert(0, 'abc')
    a.delete(2, 1)
    undo.undo() // "abc" again, but "c" is a new char now
    undo.undo() // must remove the new "c" as well
    expect(a.text()).toBe('')
  })
})

describe('textarea diffing', () => {
  it('finds the splice using the caret', () => {
    expect(diffText('aa', 'aaa', 1)).toEqual({ index: 0, remove: 0, insert: 'a' })
    expect(diffText('aa', 'aaa', 3)).toEqual({ index: 2, remove: 0, insert: 'a' })
    expect(diffText('hello', 'help', 4)).toEqual({ index: 3, remove: 2, insert: 'p' })
    expect(diffText('same', 'same')).toBeNull()
  })

  it('never splits a surrogate pair', () => {
    const ch = diffText('a😀b', 'a😃b', 3)!
    expect(ch.insert).toBe('😃')
    expect(ch.remove).toBe(2)
  })
})
