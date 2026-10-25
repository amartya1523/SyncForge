import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Role, UserInfo } from '@syncforge/sync/protocol'
import { config } from './config'

/**
 * Tiny HMAC-signed tokens (same idea as a JWT, without the algorithm-confusion
 * footguns). Payload is base64url JSON, signature is HMAC-SHA256 over it.
 */
function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = createHmac('sha256', config.secret).update(body).digest('base64url')
  return body + '.' + mac
}

function verify<T>(token: string): T | null {
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  const expected = createHmac('sha256', config.secret).update(body).digest()
  const given = Buffer.from(mac, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp: number }
    return payload.exp > Date.now() ? payload : null
  } catch {
    return null
  }
}

const DAY = 24 * 60 * 60 * 1000

export function issueSession(user: UserInfo): string {
  return sign({ kind: 'session', user, exp: Date.now() + 30 * DAY })
}

export function readSession(token: string | undefined | null): UserInfo | null {
  if (!token) return null
  const p = verify<{ kind: string; user: UserInfo }>(token)
  return p?.kind === 'session' ? p.user : null
}

export function issueInvite(docId: string, role: Role): string {
  return sign({ kind: 'invite', docId, role, nonce: randomBytes(4).toString('hex'), exp: Date.now() + 7 * DAY })
}

export function readInvite(token: string): { docId: string; role: Role } | null {
  const p = verify<{ kind: string; docId: string; role: Role }>(token)
  return p?.kind === 'invite' ? { docId: p.docId, role: p.role } : null
}

const COLORS = ['#ff7a45', '#36cfc9', '#9254de', '#f759ab', '#73d13d', '#ffc53d', '#40a9ff', '#ff4d4f', '#5cdbd3', '#b37feb']

export function colorFor(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

export function newId(prefix = ''): string {
  return prefix + randomBytes(5).toString('hex')
}
