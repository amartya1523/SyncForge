/**
 * Spin up N bot clients that hammer one document at the same time, possibly
 * spread across several servers, then check that every bot ended up with the
 * exact same document.
 *
 *   npm run loadtest -- --bots 100 --seconds 15 --servers http://localhost:4000,http://localhost:4001
 */
import { Doc, idKey, seededRandom } from '@syncforge/crdt'
import { SyncProvider } from '@syncforge/sync'

const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]])
    return acc
  }, []),
)
const BOTS = Number(args.bots ?? 100)
const SECONDS = Number(args.seconds ?? 10)
const RATE = Number(args.rate ?? 2) // edits per bot per second
const SERVERS = String(args.servers ?? 'http://localhost:4000').split(',')

async function post<T>(base: string, path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]?.toFixed(1) ?? '-'

async function main() {
  const owner = await post<{ token: string }>(SERVERS[0], '/api/session', { name: 'loadtest-owner' })
  const { doc } = await post<{ doc: { id: string } }>(SERVERS[0], '/api/docs', { title: `Load test ${BOTS} bots` }, owner.token)
  console.log(`doc ${doc.id} | ${BOTS} bots | ${SERVERS.length} server(s) | ${SECONDS}s @ ${RATE} edits/s/bot`)

  const sentAt = new Map<string, number>()
  const latencies: number[] = []

  const bots = await Promise.all(
    Array.from({ length: BOTS }, async (_, i) => {
      const base = SERVERS[i % SERVERS.length]
      const { token } = await post<{ token: string }>(base, '/api/session', { name: `bot-${i}` })
      const d = new Doc()
      d.on((e) => {
        if (e.local) return
        const now = performance.now()
        for (const op of e.ops) {
          const t = sentAt.get(idKey(op.id))
          if (t !== undefined && latencies.length < 200_000) latencies.push(now - t)
        }
      })
      const url = base.replace(/^http/, 'ws') + '/ws'
      return new SyncProvider({ url, docId: doc.id, token, doc: d })
    }),
  )

  const t0 = performance.now()
  while (bots.some((b) => b.status !== 'online')) {
    if (performance.now() - t0 > 20_000) throw new Error('bots failed to connect')
    await new Promise((r) => setTimeout(r, 50))
  }
  console.log(`all bots online in ${(performance.now() - t0).toFixed(0)} ms`)

  let edits = 0
  const stopAt = performance.now() + SECONDS * 1000
  await Promise.all(
    bots.map(async (bot, i) => {
      const rand = seededRandom(i + 1)
      await new Promise((r) => setTimeout(r, rand() * 1000))
      while (performance.now() < stopAt) {
        const d = bot.doc
        const op =
          d.length > 20 && rand() < 0.3
            ? d.delete(Math.floor(rand() * (d.length - 3)), 1 + Math.floor(rand() * 3))
            : d.insert(Math.floor(rand() * (d.length + 1)), String.fromCharCode(97 + Math.floor(rand() * 26)))
        if (op) {
          sentAt.set(idKey(op.id), performance.now())
          edits++
        }
        await new Promise((r) => setTimeout(r, (1000 / RATE) * (0.5 + rand())))
      }
    }),
  )
  console.log(`made ${edits} edits (${(edits / SECONDS).toFixed(0)} edits/s across the room)`)

  const t1 = performance.now()
  const converged = () => {
    const f = bots[0].doc.fingerprint()
    return bots.every((b) => b.pendingCount === 0 && b.doc.fingerprint() === f)
  }
  while (!converged()) {
    if (performance.now() - t1 > 30_000) break
    await new Promise((r) => setTimeout(r, 50))
  }
  const ok = converged()
  latencies.sort((a, b) => a - b)

  console.log('')
  console.log(`converged:            ${ok ? 'YES, all ' + BOTS + ' replicas identical' : 'NO'}`)
  console.log(`settle time:          ${(performance.now() - t1).toFixed(0)} ms after the last edit`)
  console.log(`final length:         ${bots[0].doc.length} chars`)
  console.log(`edit -> peer latency: p50 ${pct(latencies, 50)} ms | p95 ${pct(latencies, 95)} ms | p99 ${pct(latencies, 99)} ms  (${latencies.length} samples)`)

  for (const b of bots) b.destroy()
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
