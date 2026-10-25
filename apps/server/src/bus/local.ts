import type { Bus, BusEnvelope, BusMsg } from './types'

/** Single-process bus: nothing to fan out to. */
export class LocalBus implements Bus {
  publish(_room: string, _msg: BusMsg) {}
  async subscribe(_room: string, _fn: (env: BusEnvelope) => void) {}
  async unsubscribe(_room: string) {}
  async close() {}
}
