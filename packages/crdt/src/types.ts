/**
 * Every operation is identified by (client, clock). A client's clocks are
 * contiguous: an op that occupies `len` clocks starting at `clock` is followed by
 * one starting at `clock + len`. That contiguity is what lets a plain state vector
 * describe exactly which ops a replica has.
 */
export interface ID {
  client: string
  clock: number
}

/** Insert a run of characters between `o` (left origin) and `r` (right origin). */
export interface InsOp {
  t: 'ins'
  id: ID
  o: ID | null
  r: ID | null
  s: string
}

/** Delete ranges of characters: [client, firstClock, length]. Occupies one clock. */
export interface DelOp {
  t: 'del'
  id: ID
  d: DeleteRange[]
}

export type DeleteRange = [client: string, clock: number, len: number]

/**
 * Last-writer-wins write of several fields of an entry in a named map
 * (whiteboard shapes, comments, document meta). Ordered by Lamport time `lt`,
 * ties broken by client id.
 */
export interface SetOp {
  t: 'set'
  id: ID
  lt: number
  m: string
  k: string
  v: Record<string, unknown>
}

/** Placeholder for ops that no longer matter (overwritten set ops). */
export interface GcOp {
  t: 'gc'
  id: ID
  len: number
}

export type Op = InsOp | DelOp | SetOp | GcOp

/** client -> next clock we expect from that client */
export type StateVector = Record<string, number>

export function opLength(op: Op): number {
  if (op.t === 'ins') return op.s.length
  if (op.t === 'gc') return op.len
  return 1
}

export function idKey(id: ID): string {
  return id.client + ':' + id.clock
}

export function sameId(a: ID | null, b: ID | null): boolean {
  if (a === null || b === null) return a === b
  return a.client === b.client && a.clock === b.clock
}
