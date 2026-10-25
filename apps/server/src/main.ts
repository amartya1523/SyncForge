import { createApp } from './app'
import { LocalBus } from './bus/local'
import { RedisBus } from './bus/redis'
import type { Bus } from './bus/types'
import { config } from './config'
import { MemoryStore } from './store/memory'
import { PostgresStore } from './store/postgres'
import type { Store } from './store/types'

const store: Store = config.databaseUrl ? new PostgresStore(config.databaseUrl) : new MemoryStore()
const bus: Bus = config.redisUrl ? new RedisBus(config.redisUrl, config.serverId) : new LocalBus()

await store.init()
const app = createApp({ store, bus, serverId: config.serverId })
const port = await app.listen(config.port)

console.log(
  `syncforge ${config.serverId} listening on :${port}` +
    ` | store=${config.databaseUrl ? 'postgres' : 'memory'} bus=${config.redisUrl ? 'redis' : 'local'}`,
)

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  console.log('flushing rooms...')
  await app.close()
  await bus.close()
  await store.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
