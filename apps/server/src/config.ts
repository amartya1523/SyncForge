import { randomBytes } from 'node:crypto'

const env = process.env

export const config = {
  port: Number(env.PORT ?? 4000),
  /** unique per process; shows up in the UI so you can see which node you're on */
  serverId: env.SERVER_ID ?? 'node-' + randomBytes(2).toString('hex'),
  secret: env.SYNCFORGE_SECRET ?? 'dev-secret-change-me',
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  corsOrigin: env.CORS_ORIGIN ?? '*',
  /** keep an idle room in memory this long after the last person leaves */
  roomIdleMs: Number(env.ROOM_IDLE_MS ?? 30_000),
  /** write a compacted snapshot after this many new ops */
  snapshotEvery: Number(env.SNAPSHOT_EVERY ?? 500),
  autoVersionMs: Number(env.AUTO_VERSION_MS ?? 60_000),
}

if (config.secret === 'dev-secret-change-me' && env.NODE_ENV === 'production') {
  throw new Error('SYNCFORGE_SECRET must be set in production')
}
