import type { Op } from '@syncforge/crdt'
import type { Peer, UserInfo, Version } from '@syncforge/sync/protocol'

/** What servers tell each other about a room. */
export type BusMsg =
  | { k: 'ops'; ops: Op[] }
  | { k: 'awareness'; peer: Peer }
  | { k: 'leave'; conn: string }
  | { k: 'hello' } // "I just loaded this room, who's here?"
  | { k: 'clients'; clients: Record<string, UserInfo> }
  | { k: 'versions'; versions: Version[] }
  | { k: 'access' } // roles changed, re-check your connections

export interface BusEnvelope {
  room: string
  from: string
  msg: BusMsg
}

/**
 * Fan-out between server processes. Delivery may be lossy or duplicated; the CRDT
 * doesn't care, and clients repair gaps with their periodic state-vector sync.
 */
export interface Bus {
  publish(room: string, msg: BusMsg): void
  subscribe(room: string, fn: (env: BusEnvelope) => void): Promise<void>
  unsubscribe(room: string): Promise<void>
  close(): Promise<void>
}
