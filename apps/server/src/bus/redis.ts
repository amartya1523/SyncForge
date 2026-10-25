import { Redis } from 'ioredis'
import type { Bus, BusEnvelope, BusMsg } from './types'

const channel = (room: string) => 'syncforge:room:' + room

export class RedisBus implements Bus {
  private pub: Redis
  private sub: Redis
  private handlers = new Map<string, (env: BusEnvelope) => void>()

  constructor(
    url: string,
    private serverId: string,
  ) {
    this.pub = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 })
    this.sub = new Redis(url, { lazyConnect: false })
    this.sub.on('message', (ch: string, raw: string) => {
      const room = ch.slice(channel('').length)
      const fn = this.handlers.get(room)
      if (!fn) return
      try {
        const env = JSON.parse(raw) as BusEnvelope
        if (env.from !== this.serverId) fn(env)
      } catch {
        // ignore garbage on the channel
      }
    })
    for (const r of [this.pub, this.sub]) r.on('error', (e: Error) => console.error('[redis]', e.message))
  }

  publish(room: string, msg: BusMsg) {
    const env: BusEnvelope = { room, from: this.serverId, msg }
    this.pub.publish(channel(room), JSON.stringify(env)).catch(() => {})
  }

  async subscribe(room: string, fn: (env: BusEnvelope) => void) {
    this.handlers.set(room, fn)
    await this.sub.subscribe(channel(room))
  }

  async unsubscribe(room: string) {
    this.handlers.delete(room)
    await this.sub.unsubscribe(channel(room))
  }

  async close() {
    this.pub.disconnect()
    this.sub.disconnect()
  }
}
