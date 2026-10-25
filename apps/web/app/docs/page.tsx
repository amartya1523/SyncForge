'use client'

import type { Role } from '@syncforge/sync/protocol'
import { FileText, LogOut, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Aurora, Magnetic, Spotlight, Tilt } from '@/components/fx/motion'
import { Sparky } from '@/components/fx/sparky'
import { SignInCard } from '@/components/sign-in'
import { Avatar, Button, Logo, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { type Session, signOut, useSession } from '@/lib/session'

interface DocRow {
  id: string
  title: string
  role: Role
  updatedAt: number
}

const ROLE_STYLE: Record<Role, string> = {
  owner: 'text-ember border-ember/30 bg-ember/10',
  editor: 'text-tide border-tide/30 bg-tide/10',
  commenter: 'text-flare border-flare/30 bg-flare/10',
  viewer: 'text-dim border-line-strong bg-white/5',
}

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(t).toLocaleDateString()
}

export default function DocsPage() {
  const router = useRouter()
  const [session, setSession] = useSession()
  const [docs, setDocs] = useState<DocRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async (s: Session) => {
    try {
      const { docs } = await api<{ docs: DocRow[] }>('/api/docs', { token: s.token })
      setDocs(docs)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
      setDocs([])
    }
  }, [])

  useEffect(() => {
    if (session) void refresh(session)
  }, [session, refresh])

  async function create() {
    if (!session) return
    setCreating(true)
    try {
      const { doc } = await api<{ doc: { id: string } }>('/api/docs', { token: session.token, body: { title: 'Untitled document' } })
      router.push(`/d/${doc.id}${window.location.search}`)
    } catch (err) {
      setError((err as Error).message)
      setCreating(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <Aurora />
      <Spotlight />
      <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        {session && (
          <div className="flex items-center gap-3">
            <Avatar name={session.user.name} color={session.user.color} />
            <span className="hidden text-sm text-dim sm:inline">{session.user.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut()
                setSession(null)
              }}
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        )}
      </header>

      <main className="relative mx-auto max-w-5xl px-5 pb-24">
        {session === undefined ? null : !session ? (
          <div className="grid min-h-[70vh] place-items-center">
            <div className="flex flex-col items-center gap-2">
              <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 11, delay: 0.25 }}>
                <Sparky mood="curious" size={84} say="Hey! What should I call you?" />
              </motion.div>
              <SignInCard onDone={setSession} />
            </div>
          </div>
        ) : (
          <>
            <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-faint">Workspace</p>
                <h1 className="mt-2 font-display text-5xl">
                  Your <em className="text-gradient">documents</em>
                </h1>
              </div>
              <Magnetic>
                <Button variant="primary" size="lg" onClick={create} disabled={creating} className="group">
                  {creating ? <Spinner className="border-ink/30 border-t-ink" /> : <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" />}
                  New document
                </Button>
              </Magnetic>
            </div>

            {error && (
              <div className="mt-8 rounded-2xl border border-danger/30 bg-danger/10 px-5 py-4 text-sm text-danger">{error}</div>
            )}

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {docs?.map((d, i) => (
                  <Tilt key={d.id} max={9} className="rounded-2xl">
                  <motion.button
                    layout
                    initial={{ opacity: 0, y: 24, rotateX: -25 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0, transition: { type: 'spring', stiffness: 180, damping: 18, delay: i * 0.06 } }}
                    onClick={() => router.push(`/d/${d.id}${window.location.search}`)}
                    className="group relative h-full w-full overflow-hidden rounded-2xl border border-line bg-coal/70 p-5 text-left backdrop-blur transition-colors hover:border-ember/40"
                  >
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ember/50 to-transparent opacity-0 transition group-hover:opacity-100" />
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-xl border border-line bg-white/[0.03]">
                        <FileText className="size-[18px] text-dim transition group-hover:text-ember" />
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${ROLE_STYLE[d.role]}`}>
                        {d.role}
                      </span>
                    </div>
                    <h3 className="mt-5 truncate text-[15px] font-medium">{d.title}</h3>
                    <p className="mt-1 text-xs text-faint">Edited {ago(d.updatedAt)}</p>
                  </motion.button>
                  </Tilt>
                ))}
              </AnimatePresence>
            </div>

            {docs && !docs.length && !error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 rounded-3xl border border-dashed border-line-strong p-12 text-center"
              >
                <Sparky mood="sleepy" size={70} className="mx-auto mb-3" />
                <p className="font-display text-2xl">A blank anvil.</p>
                <p className="mt-2 text-sm text-dim">Create a document, then open it in a second window (or send the link) to collaborate.</p>
              </motion.div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
