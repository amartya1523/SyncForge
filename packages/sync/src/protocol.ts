import type { Op, RelativePosition, StateVector } from '@syncforge/crdt'

export type Role = 'viewer' | 'commenter' | 'editor' | 'owner'
export type LinkRole = 'none' | 'viewer' | 'commenter' | 'editor'

export const ROLE_RANK: Record<Role, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 }

export interface UserInfo {
  id: string
  name: string
  color: string
}

/** Ephemeral per-connection state: cursors, pointer on the board, what they're looking at. */
export interface Awareness {
  view?: 'doc' | 'board'
  cursor?: { anchor: RelativePosition; head: RelativePosition } | null
  pointer?: { x: number; y: number } | null
  typing?: boolean
  idle?: boolean
}

export interface Peer {
  conn: string
  user: UserInfo
  state: Awareness
  server?: string
}

export interface Version {
  id: string
  docId: string
  name: string
  auto: boolean
  author: UserInfo | null
  createdAt: number
  sv: StateVector
  /** whiteboard state at that moment; text is reconstructed from the CRDT itself */
  maps: Record<string, Record<string, Record<string, unknown>>>
  preview: string
  chars: number
}

export type ClientMsg =
  | { t: 'hello'; doc: string; token: string; sv: StateVector }
  | { t: 'ops'; ops: Op[] }
  | { t: 'sync'; sv: StateVector }
  | { t: 'awareness'; state: Awareness }
  | { t: 'version'; name: string }
  | { t: 'ping' }

export type ServerMsg =
  | {
      t: 'welcome'
      conn: string
      server: string
      role: Role
      user: UserInfo
      title: string
      sv: StateVector
      ops: Op[]
      peers: Peer[]
      clients: Record<string, UserInfo>
      versions: Version[]
    }
  | { t: 'ops'; ops: Op[] }
  | { t: 'ack'; sv: StateVector }
  | { t: 'awareness'; peer: Peer }
  | { t: 'leave'; conn: string }
  | { t: 'clients'; clients: Record<string, UserInfo> }
  | { t: 'versions'; versions: Version[] }
  | { t: 'role'; role: Role }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong' }

export type ErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'rate_limited' | 'bad_request' | 'read_only'

/** Biggest ops batch a client sends in one frame; long offline sessions are chunked. */
export const MAX_OPS_PER_MESSAGE = 500
