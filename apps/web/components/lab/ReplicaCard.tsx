'use client'

import { diffText, transformIndex, type Doc } from '@syncforge/crdt'
import { ArrowDown, ArrowUp, Fingerprint, Layers, Plug, Unplug } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { shortPrint, type ReplicaMeta, type ReplicaStats } from './sim'

interface Props {
  replica: ReplicaMeta
  doc: Doc
  stats: ReplicaStats
  cut: boolean
  onToggleCut: () => void
  /** changes whenever the simulation changes, so remote edits get pulled in */
  version: number
}

export function ReplicaCard({ replica, doc, stats, cut, onToggleCut, version }: Props) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  // what the textarea showed after we last synced it with the doc
  const shownRef = useRef<string | null>(null)

  // Pull remote changes into the textarea, nudging the caret across the splice.
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const next = doc.text()
    if (el.value === next) {
      shownRef.current = next
      return
    }
    const focused = document.activeElement === el
    const change = focused ? diffText(el.value, next) : null
    const start = el.selectionStart
    const end = el.selectionEnd
    el.value = next
    shownRef.current = next
    if (focused && change) el.setSelectionRange(transformIndex(start, change), transformIndex(end, change))
  }, [doc, version])

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    const before = shownRef.current ?? doc.text()
    const change = diffText(before, el.value, el.selectionEnd)
    if (change) {
      doc.transact(() => {
        if (change.remove) doc.delete(change.index, change.remove)
        if (change.insert) doc.insert(change.index, change.insert)
      })
    }
    shownRef.current = doc.text()
  }

  const fingerprint = doc.fingerprint()
  const pending = doc.pendingCount

  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-coal/80 p-4 transition-colors',
        cut ? 'border-danger/40' : 'border-line',
      )}
      style={{ boxShadow: cut ? '0 0 60px -28px var(--color-danger)' : `0 0 70px -34px ${replica.color}` }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 h-32 w-3/4 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: cut ? 'var(--color-danger)' : replica.color }}
      />

      <div className="relative flex items-center gap-2.5">
        <span
          className="grid size-7 place-items-center rounded-full text-[12px] font-semibold text-ink"
          style={{ background: replica.color, boxShadow: `0 0 18px -2px ${replica.color}` }}
        >
          {replica.short}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold tracking-tight">{replica.name}</div>
          <div className="font-mono text-[10.5px] text-faint">client · {replica.id}</div>
        </div>
        <button
          onClick={onToggleCut}
          aria-pressed={cut}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors',
            cut
              ? 'border-danger/40 bg-danger/15 text-danger hover:bg-danger/25'
              : 'border-line-strong bg-white/[0.03] text-dim hover:border-white/25 hover:text-fg',
          )}
        >
          {cut ? <Unplug className="size-3.5" /> : <Plug className="size-3.5" />}
          {cut ? 'Cable cut' : 'Cut cable'}
        </button>
      </div>

      <div className="relative">
        <textarea
          ref={areaRef}
          defaultValue={doc.text()}
          onInput={onInput}
          rows={5}
          spellCheck={false}
          aria-label={`${replica.name}'s replica`}
          className="scroll-thin block w-full resize-none rounded-xl border border-line bg-ink/60 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-fg outline-none transition-colors focus:border-line-strong"
          style={{ caretColor: replica.color }}
        />
        {cut && (
          <span className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-danger/15 px-1.5 py-0.5 font-mono text-[10px] text-danger">
            offline · edits stay local
          </span>
        )}
      </div>

      <div className="relative flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <Chip title="Fingerprint of the visible state">
          <Fingerprint className="size-3" style={{ color: replica.color }} />
          {shortPrint(fingerprint)}
        </Chip>
        <Chip title="Ops buffered while waiting for missing dependencies" warn={pending > 0}>
          <Layers className="size-3" />
          {pending} pending
        </Chip>
        <Chip title="Packets sent">
          <ArrowUp className="size-3" />
          {stats.sent}
        </Chip>
        <Chip title="Packets received">
          <ArrowDown className="size-3" />
          {stats.received}
        </Chip>
      </div>
    </div>
  )
}

function Chip({ children, title, warn }: { children: React.ReactNode; title: string; warn?: boolean }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5',
        warn ? 'border-flare/30 bg-flare/10 text-flare' : 'border-line bg-white/[0.02] text-dim',
      )}
    >
      {children}
    </span>
  )
}
