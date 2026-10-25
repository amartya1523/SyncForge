const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 10 random base36 chars. Fresh for every session, see PROBLEM_ANALYSIS §2.6 */
export function randomClientId(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  let id = ''
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length]
  return id
}

/** Small seeded PRNG (mulberry32) so fuzz failures can be replayed by seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
