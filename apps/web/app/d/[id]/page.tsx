'use client'

import type { Version } from '@syncforge/sync/protocol'
import { Lock, MessageSquare, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { SignInCard } from '@/components/sign-in'
import { Button, Spinner } from '@/components/ui'
import { Board } from '@/components/workspace/board'
import { MobileViewTabs, ShareDialog, TopBar, VersionPreview, type View } from '@/components/workspace/chrome'
import { Editor } from '@/components/workspace/editor'
import { type Panel, Sidebar } from '@/components/workspace/sidebar'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useSession } from '@/lib/session'
import { useCollab } from '@/lib/use-collab'

function Workspace() {
  const { id } = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const [session, setSession] = useSession()
  const [accepting, setAccepting] = useState(false)

  // accept an invite link before connecting, so the room sees our new role
  const invite = search.get('invite')
  useEffect(() => {
    if (!session || !invite) return
    setAccepting(true)
    api('/api/invites/accept', { token: session.token, body: { token: invite } })
      .catch(() => {})
      .finally(() => {
        const params = new URLSearchParams(search)
        params.delete('invite')
        router.replace(`/d/${id}${params.size ? '?' + params : ''}`)
        setAccepting(false)
      })
  }, [session, invite, id, router, search])

  if (session === undefined) return null
  if (!session)
    return (
      <div className="grid min-h-dvh place-items-center p-5">
        <SignInCard onDone={setSession} />
      </div>
    )
  if (accepting || invite)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    )
  return <Room docId={id} session={session} />
}

function Room({ docId, session }: { docId: string; session: NonNullable<ReturnType<typeof useSession>[0]> }) {
  const collab = useCollab(docId, session)
  const [view, setView] = useState<View>('doc')
  const [panel, setPanel] = useState<Panel>('comments')
  const [blame, setBlame] = useState(false)
  const [share, setShare] = useState(false)
  const [sidebar, setSidebar] = useState(false)
  const [selection, setSelection] = useState({ from: 0, to: 0 })
  const [activeComment, setActiveComment] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<Version | null>(null)

  const readOnly = !(collab.role === 'editor' || collab.role === 'owner')
  const onSelection = useCallback((s: { from: number; to: number }) => setSelection(s), [])

  useEffect(() => {
    collab.provider?.setAwareness({ view })
  }, [view, collab.provider])

  if (collab.status === 'denied' && !collab.doc.length) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <Lock className="mx-auto size-8 text-danger" />
          <h1 className="mt-4 font-display text-4xl">No way in.</h1>
          <p className="mt-2 text-dim">{collab.error ?? 'You do not have access to this document.'}</p>
          <Button className="mt-6" onClick={() => (window.location.href = '/docs')}>
            Back to documents
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar
        collab={collab}
        session={session}
        view={view}
        onView={(v) => {
          setView(v)
          setPreviewing(null)
        }}
        blame={blame}
        onBlame={setBlame}
        onShare={() => setShare(true)}
        onToggleSidebar={() => setSidebar((s) => !s)}
      />
      <MobileViewTabs view={view} onView={setView} />

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          {view === 'doc' ? (
            <div className="scroll-thin absolute inset-0 overflow-y-auto">
              <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-72 [mask-image:linear-gradient(black,transparent)]" />
              <div className="relative mx-auto max-w-[760px] px-5 pb-10 pt-10 sm:px-8 sm:pt-14">
                <AnimatePresence>
                  {readOnly && collab.role && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6 flex items-center gap-2 rounded-xl border border-line-strong bg-white/[0.03] px-3 py-2 text-[13px] text-dim"
                    >
                      {collab.role === 'commenter' ? <MessageSquare className="size-4 text-flare" /> : <Lock className="size-4" />}
                      You can {collab.role === 'commenter' ? 'read and comment on' : 'read'} this document. The server rejects edits from your role.
                    </motion.div>
                  )}
                </AnimatePresence>
                {!collab.ready ? (
                  <div className="space-y-3 pt-2">
                    {[92, 76, 84, 40].map((w, i) => (
                      <div key={i} className="h-4 animate-pulse rounded bg-white/[0.05]" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : previewing ? (
                  <VersionPreview collab={collab} version={previewing} onExit={() => setPreviewing(null)} />
                ) : (
                  <Editor
                    collab={collab}
                    readOnly={readOnly}
                    blame={blame}
                    activeComment={activeComment}
                    onActiveComment={(id) => {
                      setActiveComment(id)
                      if (id) setPanel('comments')
                    }}
                    onSelection={onSelection}
                  />
                )}
              </div>
            </div>
          ) : (
            <Board collab={collab} readOnly={readOnly} />
          )}

          <AnimatePresence>
            {collab.error && collab.status !== 'denied' && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-danger/30 bg-coal px-4 py-2 text-sm text-danger shadow-xl"
              >
                {collab.error}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <aside
          className={cn(
            'w-[340px] shrink-0 border-l border-line bg-coal/60',
            'max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-[min(360px,92vw)] max-lg:bg-coal max-lg:shadow-2xl max-lg:transition-transform',
            sidebar ? 'max-lg:translate-x-0' : 'max-lg:translate-x-full',
          )}
        >
          <button onClick={() => setSidebar(false)} className="absolute right-3 top-3.5 z-10 grid size-7 place-items-center rounded-lg text-dim lg:hidden">
            <X className="size-4" />
          </button>
          <Sidebar
            collab={collab}
            panel={panel}
            onPanel={setPanel}
            selection={selection}
            activeComment={activeComment}
            onActiveComment={setActiveComment}
            previewing={previewing}
            onPreview={(v) => {
              setPreviewing(v)
              if (v) setView('doc')
            }}
          />
        </aside>
      </div>

      <AnimatePresence>{share && <ShareDialog docId={docId} session={session} onClose={() => setShare(false)} />}</AnimatePresence>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  )
}
