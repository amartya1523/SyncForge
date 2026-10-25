'use client'

import type { LinkRole, Role, Version } from '@syncforge/sync/protocol'
import { ArrowLeft, Check, Copy, Eye, FileText, Highlighter, LayoutDashboard, Link2, PanelRight, RotateCcw, Share2, WifiOff, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Avatar, Button, Tabs } from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { Session } from '@/lib/session'
import { type Collab, useDocVersion } from '@/lib/use-collab'

export type View = 'doc' | 'board'

// ------------------------------------------------------------------ status

export function StatusPill({ collab }: { collab: Collab }) {
  const { status, pending, server } = collab
  const tone =
    status === 'online'
      ? pending > 0
        ? { dot: 'bg-flare', text: 'Saving…', ring: 'border-flare/25' }
        : { dot: 'bg-tide', text: 'Live', ring: 'border-tide/25' }
      : status === 'connecting'
        ? { dot: 'bg-flare animate-pulse-soft', text: 'Reconnecting', ring: 'border-flare/25' }
        : status === 'denied'
          ? { dot: 'bg-danger', text: 'No access', ring: 'border-danger/30' }
          : { dot: 'bg-faint', text: 'Offline', ring: 'border-line-strong' }
  return (
    <motion.div layout className={cn('flex h-8 items-center gap-2 rounded-full border bg-white/[0.02] px-3 text-[12px]', tone.ring)}>
      <span className="relative flex size-2">
        {status === 'online' && !pending && <span className="absolute inset-0 animate-ping rounded-full bg-tide/60" />}
        <span className={cn('relative size-2 rounded-full', tone.dot)} />
      </span>
      <span className="font-medium">{tone.text}</span>
      {server && status === 'online' && <span className="hidden font-mono text-[10px] text-faint sm:inline">{server}</span>}
      <AnimatePresence>
        {pending > 0 && (
          <motion.span
            key="pending"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            className="overflow-hidden whitespace-nowrap font-mono text-[11px] text-flare"
          >
            {pending} unsynced
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function OfflineSwitch({ collab }: { collab: Collab }) {
  const offline = collab.status === 'offline'
  const p = collab.provider
  return (
    <button
      onClick={() => (offline ? p?.connect() : p?.disconnect())}
      disabled={!p || collab.status === 'denied'}
      title="Simulate going offline: keep editing, then reconnect and watch it merge"
      className={cn(
        'flex h-8 items-center gap-2 rounded-full border px-2.5 text-[12px] transition',
        offline ? 'border-flare/40 bg-flare/10 text-flare' : 'border-line text-dim hover:text-fg',
      )}
    >
      <WifiOff className="size-3.5" />
      <span className="hidden md:inline">{offline ? 'Go online' : 'Go offline'}</span>
      <span className={cn('relative h-4 w-7 rounded-full transition', offline ? 'bg-flare' : 'bg-white/10')}>
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 700, damping: 35 }}
          className={cn('absolute top-0.5 size-3 rounded-full bg-fg', offline ? 'right-0.5' : 'left-0.5')}
        />
      </span>
    </button>
  )
}

function Presence({ collab }: { collab: Collab }) {
  // one avatar per person, even with several tabs open
  const seen = new Set<string>()
  const people = collab.peers.filter((p) => p.conn !== collab.provider?.conn && !seen.has(p.user.id) && seen.add(p.user.id))
  return (
    <div className="flex items-center -space-x-2">
      <AnimatePresence initial={false}>
        {people.slice(0, 5).map((p) => (
          <motion.span
            key={p.user.id}
            layout
            initial={{ opacity: 0, scale: 0.4, x: -6 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            <Avatar name={p.user.name} color={p.user.color} size={28} ring />
          </motion.span>
        ))}
      </AnimatePresence>
      {people.length > 5 && (
        <span className="grid size-7 place-items-center rounded-full bg-smoke text-[10px] font-semibold ring-2 ring-ink">+{people.length - 5}</span>
      )}
    </div>
  )
}

function TitleInput({ collab }: { collab: Collab }) {
  useDocVersion(collab.doc, 'meta')
  const live = collab.doc.get('meta', 'doc')?.title
  const title = typeof live === 'string' ? live : (collab.provider?.title ?? '')
  const canEdit = collab.role === 'editor' || collab.role === 'owner'
  return (
    <input
      value={title}
      readOnly={!canEdit}
      onChange={(e) => collab.doc.set('meta', 'doc', { title: e.target.value.slice(0, 120) })}
      placeholder="Untitled document"
      className="h-8 w-full min-w-0 max-w-[280px] truncate rounded-lg bg-transparent px-2 text-[15px] font-medium outline-none transition hover:bg-white/[0.04] focus:bg-white/[0.06]"
    />
  )
}

export function TopBar({
  collab,
  session,
  view,
  onView,
  blame,
  onBlame,
  onShare,
  onToggleSidebar,
}: {
  collab: Collab
  session: Session
  view: View
  onView: (v: View) => void
  blame: boolean
  onBlame: (b: boolean) => void
  onShare: () => void
  onToggleSidebar: () => void
}) {
  return (
    <header className="glass relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
      <Link href="/docs" className="grid size-8 shrink-0 place-items-center rounded-lg text-dim transition hover:bg-white/[0.06] hover:text-fg" title="All documents">
        <ArrowLeft className="size-4" />
      </Link>
      <TitleInput collab={collab} />
      <div className="mx-auto hidden md:block">
        <Tabs
          id="view-tab"
          value={view}
          onChange={onView}
          items={[
            { value: 'doc', label: <><FileText className="size-3.5" /> Document</> },
            { value: 'board', label: <><LayoutDashboard className="size-3.5" /> Board</> },
          ]}
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Presence collab={collab} />
        <StatusPill collab={collab} />
        <OfflineSwitch collab={collab} />
        {view === 'doc' && (
          <button
            onClick={() => onBlame(!blame)}
            title="Colour text by author"
            className={cn('hidden h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition sm:flex', blame ? 'border-violet/40 bg-violet/10 text-violet' : 'border-line text-dim hover:text-fg')}
          >
            <Highlighter className="size-3.5" /> <span className="hidden lg:inline">Authors</span>
          </button>
        )}
        {collab.role === 'owner' && (
          <Button size="sm" variant="primary" onClick={onShare} className="h-8">
            <Share2 className="size-3.5" /> <span className="hidden sm:inline">Share</span>
          </Button>
        )}
        <span className="hidden sm:block">
          <Avatar name={session.user.name} color={session.user.color} size={28} />
        </span>
        <button onClick={onToggleSidebar} className="grid size-8 place-items-center rounded-lg text-dim hover:bg-white/[0.06] hover:text-fg lg:hidden" title="Panel">
          <PanelRight className="size-4" />
        </button>
      </div>
      <div className="absolute inset-x-0 -bottom-px mx-auto h-px max-w-xl bg-gradient-to-r from-transparent via-ember/40 to-transparent" />
    </header>
  )
}

export function MobileViewTabs({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <div className="flex justify-center border-b border-line py-2 md:hidden">
      <Tabs
        id="view-tab-m"
        value={view}
        onChange={onView}
        items={[
          { value: 'doc', label: 'Document' },
          { value: 'board', label: 'Board' },
        ]}
      />
    </div>
  )
}

// ------------------------------------------------------------------ share

const LINK_OPTIONS: Array<{ value: LinkRole; label: string; hint: string }> = [
  { value: 'editor', label: 'Can edit', hint: 'Anyone with the link can edit' },
  { value: 'commenter', label: 'Can comment', hint: 'Read and comment, no edits' },
  { value: 'viewer', label: 'Can view', hint: 'Read only' },
  { value: 'none', label: 'Restricted', hint: 'Only people you invite' },
]

export function ShareDialog({ docId, session, onClose }: { docId: string; session: Session; onClose: () => void }) {
  const [linkRole, setLinkRole] = useState<LinkRole | null>(null)
  const [inviteRole, setInviteRole] = useState<Role>('editor')
  const [invite, setInvite] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const base = typeof window !== 'undefined' ? `${window.location.origin}/d/${docId}` : ''

  useEffect(() => {
    api<{ doc: { linkRole: LinkRole } }>(`/api/docs/${docId}`, { token: session.token })
      .then((r) => setLinkRole(r.doc.linkRole))
      .catch((e) => setError(e.message))
  }, [docId, session.token])

  async function changeLink(role: LinkRole) {
    setLinkRole(role)
    await api(`/api/docs/${docId}`, { token: session.token, method: 'PATCH', body: { linkRole: role } }).catch((e) => setError(e.message))
  }

  async function makeInvite() {
    const { token } = await api<{ token: string }>(`/api/docs/${docId}/invites`, { token: session.token, body: { role: inviteRole } })
    setInvite(`${base}?invite=${encodeURIComponent(token)}`)
  }

  function copy(text: string, key: string) {
    void navigator.clipboard?.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1400)
  }

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        initial={{ y: 20, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 10, scale: 0.98, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-line-strong bg-coal p-6 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.8)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-3xl">Share</h2>
            <p className="mt-1 text-sm text-dim">Roles are enforced by the server on every single operation.</p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-dim hover:bg-white/[0.06]">
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-6 text-xs font-medium uppercase tracking-wider text-faint">General access</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {LINK_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => changeLink(o.value)}
              className={cn('rounded-xl border p-3 text-left transition', linkRole === o.value ? 'border-ember/50 bg-ember/10' : 'border-line hover:border-line-strong')}
            >
              <span className="block text-[13px] font-medium">{o.label}</span>
              <span className="mt-0.5 block text-[11px] text-faint">{o.hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-ink/60 px-3 font-mono text-[12px] text-dim">
            <Link2 className="size-3.5 shrink-0" />
            <span className="truncate">{base}</span>
          </div>
          <Button onClick={() => copy(base, 'link')}>{copied === 'link' ? <Check className="size-4 text-tide" /> : <Copy className="size-4" />}</Button>
        </div>

        <p className="mt-6 text-xs font-medium uppercase tracking-wider text-faint">Invite link</p>
        <div className="mt-2 flex gap-2">
          <select
            value={inviteRole}
            onChange={(e) => {
              setInviteRole(e.target.value as Role)
              setInvite(null)
            }}
            className="h-10 rounded-xl border border-line-strong bg-ink px-3 text-sm outline-none"
          >
            <option value="editor">Editor</option>
            <option value="commenter">Commenter</option>
            <option value="viewer">Viewer</option>
          </select>
          <Button className="flex-1" onClick={makeInvite}>
            Create signed invite
          </Button>
        </div>
        {invite && (
          <div className="mt-2 flex gap-2">
            <div className="flex h-10 min-w-0 flex-1 items-center rounded-xl border border-tide/30 bg-tide/[0.06] px-3 font-mono text-[11px] text-tide">
              <span className="truncate">{invite}</span>
            </div>
            <Button onClick={() => copy(invite, 'invite')}>{copied === 'invite' ? <Check className="size-4 text-tide" /> : <Copy className="size-4" />}</Button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </motion.div>
    </motion.div>
  )
}

// ------------------------------------------------------------------ version preview

export function restoreVersion(collab: Collab, v: Version) {
  const { doc } = collab
  doc.transact(() => {
    doc.restoreText(v.sv)
    const then = v.maps.shapes ?? {}
    for (const [id, cur] of doc.getMap('shapes')) if (!(id in then) && !cur.deleted) doc.set('shapes', id, { deleted: true })
    for (const [id, fields] of Object.entries(then)) {
      const cur = doc.get('shapes', id) ?? {}
      const changed = Object.fromEntries(Object.entries(fields).filter(([k, val]) => JSON.stringify(cur[k]) !== JSON.stringify(val)))
      if (Object.keys(changed).length) doc.set('shapes', id, changed)
    }
  }, 'restore')
  collab.provider?.createVersion(`Restored “${v.name}”`)
}

export function VersionPreview({ collab, version, onExit }: { collab: Collab; version: Version; onExit: () => void }) {
  useDocVersion(collab.doc, 'text')
  const runs = collab.doc.compare(version.sv)
  const added = runs.filter((r) => r.kind === 'added').reduce((n, r) => n + r.text.length, 0)
  const removed = runs.filter((r) => r.kind === 'removed').reduce((n, r) => n + r.text.length, 0)
  const canRestore = collab.role === 'editor' || collab.role === 'owner'
  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-3 z-10 mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-ember/30 bg-coal/95 p-3 pl-4 shadow-xl backdrop-blur"
      >
        <Eye className="size-4 text-ember" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Comparing “{version.name}” with now</p>
          <p className="text-[12px] text-dim">
            <span className="text-tide">+{added}</span> added since · <span className="text-danger">−{removed}</span> removed since
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onExit}>
          Close
        </Button>
        {canRestore && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              restoreVersion(collab, version)
              onExit()
            }}
          >
            <RotateCcw className="size-3.5" /> Restore
          </Button>
        )}
      </motion.div>
      <div className="editor-backdrop !text-fg/90 !pointer-events-auto !select-text">
        {runs.map((r, i) => (
          <span
            key={i}
            className={cn(
              r.kind === 'added' && 'rounded-[3px] bg-tide/15 text-tide',
              r.kind === 'removed' && 'rounded-[3px] bg-danger/10 text-danger/80 line-through decoration-danger/60',
            )}
          >
            {r.text}
          </span>
        ))}
      </div>
    </div>
  )
}
