'use client'

import { randomClientId } from '@syncforge/crdt'
import type { Version } from '@syncforge/sync/protocol'
import { Check, Clock3, CornerDownRight, History, MessageSquare, RotateCcw, Save, Unlink, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Avatar, Button, Tabs } from '@/components/ui'
import { cn } from '@/lib/cn'
import { type Collab, useDocVersion } from '@/lib/use-collab'
import { type CommentEntry, readComments } from './editor'

export type Panel = 'comments' | 'history' | 'people'

function ago(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(t).toLocaleDateString()
}

interface Props {
  collab: Collab
  panel: Panel
  onPanel: (p: Panel) => void
  selection: { from: number; to: number }
  activeComment: string | null
  onActiveComment: (id: string | null) => void
  previewing: Version | null
  onPreview: (v: Version | null) => void
}

export function Sidebar(props: Props) {
  const { panel, onPanel, collab } = props
  const open = readComments(collab).filter((c) => !c.parent && !c.resolved).length
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line p-3">
        <Tabs
          id="side-tab"
          value={panel}
          onChange={onPanel}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          items={[
            {
              value: 'comments',
              label: (
                <>
                  <MessageSquare className="size-3.5" /> Comments
                  {open > 0 && <span className="rounded-full bg-flare/20 px-1.5 text-[10px] text-flare">{open}</span>}
                </>
              ),
            },
            { value: 'history', label: <><History className="size-3.5" /> History</> },
            { value: 'people', label: <><Users className="size-3.5" /> {collab.peers.length + 1}</> },
          ]}
        />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={panel}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.16 }}
            className="p-3"
          >
            {panel === 'comments' && <Comments {...props} />}
            {panel === 'history' && <HistoryPanel {...props} />}
            {panel === 'people' && <People collab={collab} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ comments

function Comments({ collab, selection, activeComment, onActiveComment }: Props) {
  useDocVersion(collab.doc, 'comments')
  useDocVersion(collab.doc, 'text')
  const { doc, provider, role } = collab
  const [draft, setDraft] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const canComment = role !== 'viewer' && role !== null
  const all = readComments(collab)
  const threads = all.filter((c) => !c.parent && (showResolved || !c.resolved))
  const hasSelection = selection.to > selection.from
  const quote = hasSelection ? doc.text().slice(selection.from, selection.to) : ''

  function add(text: string, parent?: CommentEntry) {
    const user = provider?.user
    if (!user || !text.trim()) return
    const id = 'k' + randomClientId().slice(0, 8)
    doc.set('comments', id, {
      text: text.trim(),
      author: user,
      // anchored to character ids, so it follows the text through everyone's edits
      anchor: parent ? null : doc.anchor(selection.from, selection.to),
      quote: parent ? '' : quote.slice(0, 140),
      createdAt: Date.now(),
      resolved: false,
      ...(parent ? { parent: parent.id } : {}),
    })
    if (!parent) onActiveComment(id)
  }

  return (
    <div className="space-y-3">
      {canComment && (
        <div className={cn('rounded-2xl border p-3 transition', hasSelection ? 'border-flare/40 bg-flare/[0.04]' : 'border-line bg-white/[0.02]')}>
          {hasSelection ? (
            <p className="mb-2 line-clamp-2 border-l-2 border-flare/60 pl-2 text-xs italic text-dim">“{quote}”</p>
          ) : (
            <p className="mb-2 text-xs text-faint">Select text in the document to comment on it.</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!hasSelection) return
              add(draft)
              setDraft('')
            }}
            className="flex gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!hasSelection}
              placeholder={hasSelection ? 'Add a comment…' : ''}
              className="h-9 min-w-0 flex-1 rounded-xl border border-line-strong bg-ink/60 px-3 text-sm outline-none focus:border-flare/60 disabled:opacity-40"
            />
            <Button size="sm" variant="primary" disabled={!hasSelection || !draft.trim()} className="h-9">
              Post
            </Button>
          </form>
        </div>
      )}

      <AnimatePresence initial={false}>
        {threads.map((c) => {
          const detached = c.anchor ? !doc.resolveAnchor(c.anchor) : false
          const replies = all.filter((r) => r.parent === c.id)
          return (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={() => onActiveComment(c.id)}
              className={cn(
                'cursor-pointer rounded-2xl border p-3 transition',
                activeComment === c.id ? 'border-flare/50 bg-flare/[0.06]' : 'border-line bg-coal hover:border-line-strong',
                c.resolved && 'opacity-60',
              )}
            >
              <CommentRow c={c} />
              {c.quote && (
                <p className={cn('mt-2 line-clamp-2 border-l-2 pl-2 text-xs italic', detached ? 'border-danger/50 text-faint line-through' : 'border-flare/50 text-dim')}>
                  “{c.quote}”
                </p>
              )}
              {detached && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-danger/90">
                  <Unlink className="size-3" /> The text this was attached to was deleted
                </p>
              )}
              {replies.map((r) => (
                <div key={r.id} className="mt-2.5 flex gap-1.5 pl-1">
                  <CornerDownRight className="mt-1 size-3 shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <CommentRow c={r} small />
                  </div>
                </div>
              ))}
              {activeComment === c.id && canComment && (
                <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <ReplyBox onSend={(t) => add(t, c)} />
                  <Button
                    size="sm"
                    variant="ghost"
                    title={c.resolved ? 'Re-open' : 'Resolve'}
                    onClick={() => doc.set('comments', c.id, { resolved: !c.resolved })}
                  >
                    <Check className="size-4" />
                  </Button>
                </div>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>

      {!threads.length && (
        <p className="px-2 py-8 text-center text-sm text-faint">No open comments. Comments stay attached to their words even as everyone edits around them.</p>
      )}
      {all.some((c) => c.resolved && !c.parent) && (
        <button onClick={() => setShowResolved((v) => !v)} className="w-full py-2 text-xs text-faint hover:text-dim">
          {showResolved ? 'Hide' : 'Show'} resolved
        </button>
      )}
    </div>
  )
}

function CommentRow({ c, small }: { c: CommentEntry; small?: boolean }) {
  return (
    <div className="flex gap-2.5">
      <Avatar name={c.author.name} color={c.author.color} size={small ? 20 : 24} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium">{c.author.name}</span>
          <span className="shrink-0 text-[11px] text-faint">{ago(c.createdAt)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg/90">{c.text}</p>
      </div>
    </div>
  )
}

function ReplyBox({ onSend }: { onSend: (t: string) => void }) {
  const [t, setT] = useState('')
  return (
    <form
      className="flex-1"
      onSubmit={(e) => {
        e.preventDefault()
        onSend(t)
        setT('')
      }}
    >
      <input
        value={t}
        onChange={(e) => setT(e.target.value)}
        placeholder="Reply…"
        className="h-8 w-full rounded-lg border border-line-strong bg-ink/60 px-2.5 text-[13px] outline-none focus:border-flare/60"
      />
    </form>
  )
}

// ------------------------------------------------------------------ history

function HistoryPanel({ collab, previewing, onPreview }: Props) {
  const { provider, versions } = collab
  const [name, setName] = useState('')
  const canSave = collab.role === 'editor' || collab.role === 'owner'

  return (
    <div className="space-y-3">
      {canSave && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            provider?.createVersion(name.trim() || `Version ${versions.length + 1}`)
            setName('')
          }}
          className="flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this version…"
            className="h-9 min-w-0 flex-1 rounded-xl border border-line-strong bg-ink/60 px-3 text-sm outline-none focus:border-ember/60"
          />
          <Button size="sm" className="h-9" title="Save version">
            <Save className="size-4" />
          </Button>
        </form>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-faint">
        A version is just a state vector, so any of them can be previewed against now — and restoring one is a new edit that keeps everyone else&apos;s work.
      </p>

      <ol className="relative space-y-1.5 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-line-strong">
        <li>
          <button
            onClick={() => onPreview(null)}
            className={cn('relative flex w-full items-center gap-3 rounded-xl p-2 text-left transition', !previewing ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]')}
          >
            <span className="relative z-10 grid size-[14px] place-items-center rounded-full bg-tide ml-2 shadow-[0_0_12px_var(--color-tide)]" />
            <span className="text-[13px] font-medium">Now · live</span>
          </button>
        </li>
        {versions.map((v) => (
          <li key={v.id}>
            <button
              onClick={() => onPreview(v)}
              className={cn(
                'relative flex w-full items-start gap-3 rounded-xl p-2 text-left transition',
                previewing?.id === v.id ? 'bg-ember/10 ring-1 ring-ember/30' : 'hover:bg-white/[0.03]',
              )}
            >
              <span
                className={cn(
                  'relative z-10 ml-[11px] mt-1 size-[9px] shrink-0 rounded-full border-2',
                  v.auto ? 'border-faint bg-ink' : 'border-ember bg-ember',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className={cn('truncate text-[13px]', v.auto ? 'text-dim' : 'font-medium')}>{v.name}</span>
                  {v.name.startsWith('Restored') && <RotateCcw className="size-3 text-ember" />}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                  <Clock3 className="size-3" /> {ago(v.createdAt)}
                  {v.author && <> · {v.author.name}</>} · {v.chars} chars
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {!versions.length && <p className="px-2 py-6 text-center text-sm text-faint">No versions yet. Save one, or keep editing — autosaves happen every minute.</p>}
    </div>
  )
}

// ------------------------------------------------------------------ people

function People({ collab }: { collab: Collab }) {
  const me = collab.provider?.user
  const rows = [
    ...(me ? [{ conn: 'me', user: me, state: {}, server: collab.server ?? undefined, self: true }] : []),
    ...collab.peers.map((p) => ({ ...p, self: false })),
  ]
  return (
    <ul className="space-y-1">
      <AnimatePresence initial={false}>
        {rows.map((p) => (
          <motion.li
            key={p.conn}
            layout
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/[0.03]"
          >
            <span className="relative">
              <Avatar name={p.user.name} color={p.user.color} size={30} />
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-coal bg-tide" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {p.user.name} {p.self && <span className="text-faint">(you)</span>}
              </span>
              <span className="block text-[11px] text-faint">
                {'typing' in p.state && p.state.typing ? (
                  <span className="text-tide">typing…</span>
                ) : 'view' in p.state && p.state.view === 'board' ? (
                  'on the board'
                ) : (
                  'in the document'
                )}
              </span>
            </span>
            {p.server && <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-faint">{p.server}</span>}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}
