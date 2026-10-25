'use client'

import type { UserInfo } from '@syncforge/sync/protocol'
import { useEffect, useState } from 'react'
import { api } from './api'

export interface Session {
  token: string
  user: UserInfo
}

const KEY = 'syncforge.session'

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export async function signIn(name: string, current?: Session | null): Promise<Session> {
  const s = await api<Session>('/api/session', { body: { name, userId: current?.user.id }, token: current?.token })
  localStorage.setItem(KEY, JSON.stringify(s))
  return s
}

export function signOut() {
  localStorage.removeItem(KEY)
}

/** `undefined` while we haven't looked at localStorage yet (avoids a flash of the sign-in form) */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => setSession(loadSession()), [])
  return [session, setSession] as const
}
