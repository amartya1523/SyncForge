import { describe, expect, it } from 'vitest'
import { Doc, type Op, seededRandom } from '../src'

/**
 * Randomised convergence testing. A handful of replicas edit concurrently while a
 * hostile "network" shuffles, duplicates, delays and partitions their messages.
 * After everything is finally delivered, every replica must be identical.
 * Each run is driven by a seed so a failure can be replayed exactly.
 */

const SEEDS = Number(process.env.FUZZ_SEEDS ?? 400)

interface Packet {
  to: number
  ops: Op[]
}

function randomEdit(doc: Doc, rand: () => number) {
  const r = rand()
  const len = doc.length
  if (r < 0.5 || len === 0) {
    const words = ['a', 'bc', 'def', ' ', 'XYZ', '😀', '\n', 'lorem ipsum']
    doc.insert(Math.floor(rand() * (len + 1)), words[Math.floor(rand() * words.length)])
  } else if (r < 0.8) {
    const at = Math.floor(rand() * len)
    doc.delete(at, 1 + Math.floor(rand() * Math.min(5, len - at)))
  } else {
    const key = 'shape' + Math.floor(rand() * 4)
    const fields: Record<string, unknown> = {}
    if (rand() < 0.7) fields.x = Math.floor(rand() * 100)
    if (rand() < 0.5) fields.color = ['red', 'blue', 'green'][Math.floor(rand() * 3)]
    if (rand() < 0.1) fields.deleted = true
    if (!Object.keys(fields).length) fields.y = 1
    doc.set('shapes', key, fields)
  }
}

function shuffle<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

function runScenario(seed: number) {
  const rand = seededRandom(seed)
  const n = 2 + Math.floor(rand() * 4)
  const docs = Array.from({ length: n }, (_, i) => new Doc({ clientId: 'r' + i }))
  let inFlight: Packet[] = []

  docs.forEach((doc, i) =>
    doc.on((e) => {
      if (!e.local) return
      for (let j = 0; j < n; j++) if (j !== i) inFlight.push({ to: j, ops: e.ops })
    }),
  )

  const steps = 20 + Math.floor(rand() * 80)
  for (let s = 0; s < steps; s++) {
    randomEdit(docs[Math.floor(rand() * n)], rand)

    // deliver a random subset, out of order, sometimes twice, sometimes dropped
    if (rand() < 0.4) {
      shuffle(inFlight, rand)
      const keep: Packet[] = []
      for (const p of inFlight) {
        const x = rand()
        if (x < 0.5) {
          docs[p.to].apply(p.ops)
          if (rand() < 0.15) docs[p.to].apply(p.ops) // duplicate
        } else if (x < 0.6) {
          // dropped on the floor; anti-entropy below has to repair it
        } else keep.push(p)
      }
      inFlight = keep
    }

    // occasionally two replicas run a state-vector handshake (like a reconnect)
    if (rand() < 0.1) {
      const a = docs[Math.floor(rand() * n)]
      const b = docs[Math.floor(rand() * n)]
      b.apply(a.diff(b.stateVector()))
    }
  }

  // network heals: flush what's left, then full anti-entropy
  shuffle(inFlight, rand)
  for (const p of inFlight) docs[p.to].apply(p.ops)
  for (let round = 0; round < 2; round++)
    for (const a of docs) for (const b of docs) if (a !== b) b.apply(a.diff(b.stateVector()))

  return docs
}

describe('convergence fuzzing', () => {
  it(`converges for ${SEEDS} random schedules`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const docs = runScenario(seed)
      const want = docs[0]
      for (const d of docs) {
        if (d.text() !== want.text() || d.fingerprint() !== want.fingerprint()) {
          throw new Error(`seed ${seed} diverged:\n${docs.map((x) => JSON.stringify(x.text())).join('\n')}`)
        }
        expect(d.pendingCount).toBe(0)
      }
    }
  }, 60_000) // thousands of schedules; don't let a busy machine turn this into a flaky timeout

  it('a fresh replica rebuilt from the compact snapshot matches', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const [doc] = runScenario(seed)
      const copy = new Doc()
      copy.apply(doc.encode())
      expect(copy.fingerprint()).toBe(doc.fingerprint())
      expect(copy.stateVector()).toEqual(doc.stateVector())
    }
  })

  it('snapshot decoded with ops in reverse order still converges', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const [doc] = runScenario(seed)
      const copy = new Doc()
      copy.apply([...doc.encode()].reverse())
      expect(copy.fingerprint()).toBe(doc.fingerprint())
    }
  })
})

describe('offline user (scenario C)', () => {
  it('a replica offline for hundreds of edits merges on reconnect', () => {
    const rand = seededRandom(42)
    const server = new Doc({ clientId: 'server' })
    server.insert(0, 'Shared technical document.\n')
    const online = [new Doc({ clientId: 'a' }), new Doc({ clientId: 'b' })]
    const offline = new Doc({ clientId: 'c' })
    for (const d of [...online, offline]) d.apply(server.encode())

    for (let i = 0; i < 300; i++) {
      const d = online[i % 2]
      d.apply(server.diff(d.stateVector()))
      randomEdit(d, rand)
      server.apply(d.diff(server.stateVector()))
      randomEdit(offline, rand)
    }

    // reconnect handshake: exchange state vectors, send only what is missing
    const toServer = offline.diff(server.stateVector())
    const toClient = server.diff(offline.stateVector())
    expect(toServer.every((op) => op.id.client === 'c')).toBe(true)
    server.apply(toServer)
    offline.apply(toClient)
    for (const d of online) d.apply(server.diff(d.stateVector()))

    for (const d of [...online, offline]) expect(d.fingerprint()).toBe(server.fingerprint())
  })
})
