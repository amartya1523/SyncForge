import { Doc } from '@syncforge/crdt'
import { SyncProvider } from '@syncforge/sync'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { RedisBus } from '../src/bus/redis'
import { PostgresStore } from '../src/store/postgres'

// TEST_DATABASE_URL=postgres:///syncforge TEST_REDIS_URL=redis://localhost:6379 npm test
const db = process.env.TEST_DATABASE_URL
const redis = process.env.TEST_REDIS_URL

describe.skipIf(!db || !redis)('real Postgres + Redis, two nodes', () => {
  it('converges across nodes and survives both restarting', async () => {
    const nodes = await Promise.all(
      ['pg-a', 'pg-b'].map(async (id) => {
        const store = new PostgresStore(db!)
        await store.init()
        const bus = new RedisBus(redis!, id)
        const app = createApp({ store, bus, serverId: id })
        const port = await app.listen(0)
        return { store, bus, app, port }
      }),
    )
    const base = `http://localhost:${nodes[0].port}`
    const post = (path: string, body: unknown, token?: string) =>
      fetch(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify(body),
      }).then((r) => r.json())

    const { token } = await post('/api/session', { name: 'infra' })
    const { doc } = await post('/api/docs', { title: 'infra test' }, token)
    const clients = nodes.map((n) => new SyncProvider({ url: `ws://localhost:${n.port}/ws`, docId: doc.id, token, doc: new Doc() }))
    const until = async (cond: () => boolean) => {
      for (let i = 0; i < 300 && !cond(); i++) await new Promise((r) => setTimeout(r, 10))
      expect(cond()).toBe(true)
    }
    await until(() => clients.every((c) => c.status === 'online'))
    clients[0].doc.insert(0, 'from node a. ')
    clients[1].doc.insert(0, 'from node b. ')
    await until(() => clients[0].doc.text() === clients[1].doc.text() && clients[0].doc.length === 26)
    await until(() => clients.every((c) => c.pendingCount === 0))
    const want = clients[0].doc.text()

    for (const c of clients) c.destroy()
    for (const n of nodes) {
      await n.app.close()
      await n.bus.close()
    }

    const store = new PostgresStore(db!)
    const reloaded = new Doc()
    reloaded.apply(await store.loadOps(doc.id))
    expect(reloaded.text()).toBe(want)
    await store.close()
    for (const n of nodes) await n.store.close()
  })
})
