import { describe, expect, it } from 'vitest'
import { Doc } from '../src'

describe('LWW maps (whiteboard, comments)', () => {
  it('last writer by Lamport time wins per field', () => {
    const a = new Doc({ clientId: 'a' })
    const b = new Doc({ clientId: 'b' })
    a.set('shapes', 's1', { x: 1, y: 1, color: 'red' })
    b.apply(a.encode())
    b.set('shapes', 's1', { x: 50 }) // b saw a's write, so it is later
    a.set('shapes', 's1', { color: 'blue' }) // concurrent with b's write, other field
    a.apply(b.diff(a.stateVector()))
    b.apply(a.diff(b.stateVector()))
    expect(a.get('shapes', 's1')).toEqual({ x: 50, y: 1, color: 'blue' })
    expect(b.get('shapes', 's1')).toEqual(a.get('shapes', 's1'))
  })

  it('a delete beats concurrent but older moves on every replica', () => {
    const a = new Doc({ clientId: 'a' })
    const b = new Doc({ clientId: 'b' })
    a.set('shapes', 's', { x: 0 })
    b.apply(a.encode())
    a.set('shapes', 's', { x: 10 })
    a.set('shapes', 's', { x: 20 })
    b.set('shapes', 's', { deleted: true })
    a.apply(b.diff(a.stateVector()))
    b.apply(a.diff(b.stateVector()))
    expect(a.get('shapes', 's')).toEqual(b.get('shapes', 's'))
    expect(a.get('shapes', 's')?.deleted).toBe(true)
  })

  it('does not trust wall clocks: a late writer still wins after seeing the old value', () => {
    const a = new Doc({ clientId: 'zzz' }) // would win any tie
    const b = new Doc({ clientId: 'aaa' })
    for (let i = 0; i < 10; i++) a.set('m', 'k', { v: i })
    b.apply(a.encode())
    b.set('m', 'k', { v: 'b' })
    a.apply(b.diff(a.stateVector()))
    expect(a.get('m', 'k')).toEqual({ v: 'b' })
  })

  it('compacts overwritten writes when encoding', () => {
    const d = new Doc({ clientId: 'a' })
    for (let i = 0; i < 300; i++) d.set('shapes', 's1', { x: i, y: i })
    const enc = d.encode()
    expect(enc).toHaveLength(2) // one gc range + the live write
    expect(enc[0]).toMatchObject({ t: 'gc', len: 299 })

    const copy = new Doc()
    copy.apply(enc)
    expect(copy.get('shapes', 's1')).toEqual({ x: 299, y: 299 })
    expect(copy.stateVector()).toEqual(d.stateVector())
  })
})
