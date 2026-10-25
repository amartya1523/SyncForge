'use client'

import { type Anchor, type RelativePosition, diffText } from '@syncforge/crdt'
import type { Peer, UserInfo } from '@syncforge/sync/protocol'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { type Collab, useDocVersion } from '@/lib/use-collab'

export interface CommentEntry {
  id: string
  text: string
  author: UserInfo
  anchor: Anchor | null
  quote: string
  createdAt: number
  resolved?: boolean
  parent?: string
  deleted?: boolean
}

export function readComments(collab: Collab): CommentEntry[] {
  const out: CommentEntry[] = []
  for (const [id, e] of collab.doc.getMap('comments')) {
    if (e.deleted || typeof e.text !== 'string') continue
    out.push({ ...(e as unknown as CommentEntry), id })
  }
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

interface Props {
  collab: Collab
  readOnly: boolean
  blame: boolean
  activeComment: string | null
  onActiveComment: (id: string | null) => void
  onSelection: (sel: { from: number; to: number }) => void
}

interface Segment {
  text: string
  comment: string | null
  selection: string | null
  author: string | null
  carets: Peer[]
}

/**
 * A plain <textarea> does the typing (native selection, IME, spellcheck, a11y) and a
 * pixel-identical backdrop underneath paints everything else: remote carets and
 * selections, comment highlights, authorship colours. The textarea grows with its
 * content so both layers always wrap at exactly the same width.
 */
export function Editor({ collab, readOnly, blame, activeComment, onActiveComment, onSelection }: Props) {
  const { doc, undo, provider } = collab
  const ta = useRef<HTMLTextAreaElement>(null)
  const lastValue = useRef('')
  const selection = useRef<{ anchor: RelativePosition; head: RelativePosition } | null>(null)
  const composing = useRef(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useDocVersion(doc, 'text')
  useDocVersion(doc, 'comments')

  const autosize = useCallback(() => {
    const el = ta.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = el.scrollHeight + 'px'
  }, [])

  const capture = useCallback(
    (typing = false) => {
      const el = ta.current
      if (!el) return
      const backwards = el.selectionDirection === 'backward'
      const a = backwards ? el.selectionEnd : el.selectionStart
      const h = backwards ? el.selectionStart : el.selectionEnd
      const sel = { anchor: doc.relativePosition(a), head: doc.relativePosition(h) }
      selection.current = sel
      provider?.setAwareness({ view: 'doc', cursor: sel, typing })
      if (typing) {
        if (typingTimer.current) clearTimeout(typingTimer.current)
        typingTimer.current = setTimeout(() => provider?.setAwareness({ typing: false }), 1200)
      }
      onSelection({ from: el.selectionStart, to: el.selectionEnd })
    },
    [doc, provider, onSelection],
  )

  /** Bring the textarea up to date with the doc, keeping our caret on the same characters. */
  const pull = useCallback(
    (caret?: number) => {
      const el = ta.current
      if (!el) return
      const value = doc.text()
      if (el.value !== value) {
        el.value = value
        lastValue.current = value
      }
      if (caret !== undefined) el.setSelectionRange(caret, caret)
      else if (selection.current) {
        const a = doc.resolvePosition(selection.current.anchor) ?? 0
        const h = doc.resolvePosition(selection.current.head) ?? 0
        // also when unfocused: assigning .value moves the selection to the end, so someone
        // who clicked into the comment box would come back to a caret in the wrong place
        el.setSelectionRange(Math.min(a, h), Math.max(a, h), a > h ? 'backward' : 'forward')
        // keep the comment composer's quote pointing at the same words
        onSelection({ from: Math.min(a, h), to: Math.max(a, h) })
      }
      autosize()
    },
    [doc, autosize, onSelection],
  )

  useLayoutEffect(() => {
    pull()
    return doc.on((e) => {
      if (!e.textChanged) return
      // our own keystrokes are already in the textarea
      if (e.local && e.origin !== 'undo' && e.origin !== 'restore') return
      if (composing.current) return // never touch the value mid-IME composition
      pull()
    })
  }, [doc, pull])

  useEffect(() => {
    // after clicking a button (Restore, Save…) focus sits on <body>; ⌘Z should still work
    function onKey(e: KeyboardEvent) {
      if (readOnly || document.activeElement !== document.body) return
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      const caret = e.shiftKey ? undo.redo() : undo.undo()
      if (caret !== null) pull()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, pull, readOnly])

  useEffect(() => {
    const onResize = () => autosize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [autosize])

  function commitInput() {
    const el = ta.current!
    if (readOnly) {
      el.value = lastValue.current
      return
    }
    const ch = diffText(lastValue.current, el.value, el.selectionEnd)
    lastValue.current = el.value
    if (ch) {
      doc.transact(() => {
        if (ch.remove) doc.delete(ch.index, ch.remove)
        if (ch.insert) doc.insert(ch.index, ch.insert)
      })
    }
    autosize()
    capture(true)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (readOnly) return
      const caret = e.shiftKey ? undo.redo() : undo.undo()
      if (caret !== null) pull(caret)
      capture()
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      if (readOnly) return
      const caret = undo.redo()
      if (caret !== null) pull(caret)
      capture()
    } else if (e.key === 'Tab' && !readOnly) {
      e.preventDefault()
      const el = e.currentTarget
      el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end')
      commitInput()
    }
  }

  // ----------------------------------------------------------------- decorations

  const text = doc.text()
  const comments = readComments(collab)
  const self = provider?.conn

  // cheap enough to rebuild every render; renders are already coalesced per frame
  const segments = (() => {
    const ranges: Array<{ from: number; to: number; kind: 'comment' | 'selection'; key: string }> = []
    const carets: Array<{ at: number; peer: Peer }> = []

    for (const c of comments) {
      if (c.parent || c.resolved || !c.anchor) continue
      const r = doc.resolveAnchor(c.anchor)
      if (r) ranges.push({ ...r, kind: 'comment', key: c.id })
    }
    for (const p of collab.peers) {
      if (p.conn === self || !p.state.cursor || p.state.view === 'board') continue
      const a = doc.resolvePosition(p.state.cursor.anchor)
      const h = doc.resolvePosition(p.state.cursor.head)
      if (a === null || h === null) continue
      carets.push({ at: h, peer: p })
      if (a !== h) ranges.push({ from: Math.min(a, h), to: Math.max(a, h), kind: 'selection', key: p.user.color })
    }

    const runs = blame ? doc.runs() : []
    const cuts = new Set<number>([0, text.length])
    for (const r of ranges) cuts.add(r.from).add(r.to)
    for (const c of carets) cuts.add(c.at)
    let off = 0
    for (const r of runs) cuts.add((off += r.text.length))
    const points = [...cuts].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b)

    const out: Segment[] = []
    let run = 0
    let runEnd = runs[0]?.text.length ?? Infinity
    for (let i = 0; i < points.length; i++) {
      const from = points[i]
      const to = points[i + 1] ?? from
      while (from >= runEnd && run < runs.length - 1) runEnd += runs[++run].text.length
      out.push({
        text: text.slice(from, to),
        comment: ranges.find((r) => r.kind === 'comment' && r.from <= from && r.to >= to && to > from)?.key ?? null,
        selection: ranges.find((r) => r.kind === 'selection' && r.from <= from && r.to >= to && to > from)?.key ?? null,
        author: blame && to > from ? (runs[run]?.client ?? null) : null,
        carets: carets.filter((c) => c.at === from).map((c) => c.peer),
      })
    }
    return out
  })()

  function onSelect() {
    capture()
    const el = ta.current!
    const at = el.selectionStart
    const hit = comments.find((c) => {
      if (c.parent || c.resolved || !c.anchor) return false
      const r = doc.resolveAnchor(c.anchor)
      return r && at >= r.from && at <= r.to
    })
    onActiveComment(hit?.id ?? null)
  }

  return (
    <div className="relative">
      <div aria-hidden className="editor-backdrop absolute inset-0">
        {segments.map((s, i) => (
          <span key={i}>
            {s.carets.map((p) => (
              <span
                key={p.conn}
                className={cn('remote-caret', p.state.idle && 'quiet')}
                style={{ '--caret': p.user.color } as React.CSSProperties}
              >
                <span>{p.user.name}</span>
              </span>
            ))}
            <span
              className={cn(s.comment && 'comment-mark', s.comment && s.comment === activeComment && 'active')}
              style={{
                background: s.selection
                  ? s.selection + '38'
                  : s.author
                    ? (collab.clients[s.author]?.color ?? '#888888') + '2e'
                    : undefined,
                borderRadius: s.selection || s.author ? 3 : undefined,
              }}
            >
              {s.text}
            </span>
          </span>
        ))}
        {'​'}
      </div>
      <textarea
        ref={ta}
        className="editor-surface relative block w-full text-fg placeholder:text-faint"
        spellCheck
        readOnly={readOnly}
        placeholder={readOnly ? '' : 'Start writing. Open this page in another window to see it sync…'}
        onInput={commitInput}
        onKeyDown={onKeyDown}
        onBeforeInput={(e) => {
          const t = (e.nativeEvent as InputEvent).inputType
          if (t === 'historyUndo' || t === 'historyRedo') e.preventDefault()
        }}
        onSelect={onSelect}
        onFocus={() => capture()}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => {
          composing.current = false
          commitInput()
          pull()
        }}
      />
    </div>
  )
}
