'use client'

import { randomClientId } from '@syncforge/crdt'
import { Circle, Hand, Minus, MousePointer2, Pencil, Plus, Square, StickyNote, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { type Collab, useDocVersion } from '@/lib/use-collab'

type ShapeType = 'rect' | 'ellipse' | 'sticky' | 'pen'
type Tool = 'select' | 'hand' | ShapeType

interface Shape {
  id: string
  type: ShapeType
  x: number
  y: number
  w: number
  h: number
  color: string
  z: number
  text?: string
  points?: number[]
  deleted?: boolean
}

const COLORS = ['#ff6a3d', '#ffb547', '#5eead4', '#a78bfa', '#f472b6', '#ecebe8']
const TOOLS: Array<{ id: Tool; icon: typeof Square; key: string; label: string }> = [
  { id: 'select', icon: MousePointer2, key: 'v', label: 'Select' },
  { id: 'hand', icon: Hand, key: 'h', label: 'Pan' },
  { id: 'rect', icon: Square, key: 'r', label: 'Rectangle' },
  { id: 'ellipse', icon: Circle, key: 'o', label: 'Ellipse' },
  { id: 'sticky', icon: StickyNote, key: 's', label: 'Sticky note' },
  { id: 'pen', icon: Pencil, key: 'p', label: 'Pen' },
]

function smoothPath(pts: number[]): string {
  if (pts.length < 4) return ''
  let d = `M${pts[0]},${pts[1]}`
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2
    const my = (pts[i + 1] + pts[i + 3]) / 2
    d += ` Q${pts[i]},${pts[i + 1]} ${mx},${my}`
  }
  return d + ` L${pts[pts.length - 2]},${pts[pts.length - 1]}`
}

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
  | { kind: 'move'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'create'; id: string; sx: number; sy: number }
  | { kind: 'pen'; points: number[] }

export function Board({ collab, readOnly }: { collab: Collab; readOnly: boolean }) {
  const { doc, provider } = collab
  useDocVersion(doc, 'shapes')
  const svg = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState(COLORS[0])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const [draft, setDraft] = useState<number[] | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const history = useRef<{ undo: Array<Array<[string, Record<string, unknown>]>>; redo: Array<Array<[string, Record<string, unknown>]>> }>({
    undo: [],
    redo: [],
  })

  const shapes: Shape[] = []
  for (const [id, e] of doc.getMap('shapes')) if (!e.deleted && e.type) shapes.push({ ...(e as unknown as Shape), id })
  shapes.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1))
  const topZ = shapes.length ? shapes[shapes.length - 1].z : 0

  // ------------------------------------------------------------ writes

  // dragging produces a write per pointer event; batch them to ~30/s
  const pendingWrites = useRef(new Map<string, Record<string, unknown>>())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flush = useCallback(() => {
    flushTimer.current = null
    const writes = pendingWrites.current
    pendingWrites.current = new Map()
    doc.transact(() => {
      for (const [id, fields] of writes) doc.set('shapes', id, fields)
    })
  }, [doc])
  const write = useCallback(
    (id: string, fields: Record<string, unknown>, now = false) => {
      pendingWrites.current.set(id, { ...pendingWrites.current.get(id), ...fields })
      if (now) flush()
      else flushTimer.current ??= setTimeout(flush, 33)
    },
    [flush],
  )

  /** remember the fields we're about to change so ⌘Z can put them back */
  function remember(changes: Array<[string, string[]]>) {
    const step: Array<[string, Record<string, unknown>]> = changes.map(([id, fields]) => {
      const cur = doc.get('shapes', id) ?? {}
      return [id, Object.fromEntries(fields.map((f) => [f, cur[f] ?? (f === 'deleted' ? true : null)]))]
    })
    history.current.undo.push(step)
    history.current.redo = []
  }

  function travel(from: 'undo' | 'redo') {
    const step = history.current[from].pop()
    if (!step) return
    const back: Array<[string, Record<string, unknown>]> = step.map(([id, fields]) => {
      const cur = doc.get('shapes', id) ?? {}
      return [id, Object.fromEntries(Object.keys(fields).map((f) => [f, cur[f] ?? null]))]
    })
    history.current[from === 'undo' ? 'redo' : 'undo'].push(back)
    doc.transact(() => {
      for (const [id, fields] of step) doc.set('shapes', id, fields)
    })
  }

  // ------------------------------------------------------------ pointer

  function toWorld(e: { clientX: number; clientY: number }) {
    const r = svg.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - view.x) / view.zoom, y: (e.clientY - r.top - view.y) / view.zoom }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const p = toWorld(e)
    const hitId = (e.target as Element).closest('[data-shape]')?.getAttribute('data-shape') ?? null
    setEditing(null)

    if (tool === 'hand' || e.button === 1 || (tool === 'select' && !hitId) || readOnly) {
      if (tool === 'select') setSelected(null)
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: view.x, py: view.y }
      return
    }
    if (tool === 'select' && hitId) {
      const s = shapes.find((x) => x.id === hitId)!
      setSelected(hitId)
      remember([[hitId, ['x', 'y']]])
      gesture.current = { kind: 'move', id: hitId, sx: p.x, sy: p.y, ox: s.x, oy: s.y }
      return
    }
    if (tool === 'pen') {
      gesture.current = { kind: 'pen', points: [p.x, p.y] }
      setDraft([p.x, p.y])
      return
    }
    const id = 's' + randomClientId().slice(0, 8)
    remember([[id, ['deleted']]])
    write(id, { type: tool, x: p.x, y: p.y, w: 1, h: 1, color, z: topZ + 1, text: '', deleted: false }, true)
    setSelected(id)
    gesture.current = { kind: 'create', id, sx: p.x, sy: p.y }
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = toWorld(e)
    provider?.setAwareness({ view: 'board', pointer: p })
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pan') setView((v) => ({ ...v, x: g.px + e.clientX - g.sx, y: g.py + e.clientY - g.sy }))
    else if (g.kind === 'move') write(g.id, { x: Math.round(g.ox + p.x - g.sx), y: Math.round(g.oy + p.y - g.sy) })
    else if (g.kind === 'create')
      write(g.id, {
        x: Math.round(Math.min(g.sx, p.x)),
        y: Math.round(Math.min(g.sy, p.y)),
        w: Math.round(Math.abs(p.x - g.sx)),
        h: Math.round(Math.abs(p.y - g.sy)),
      })
    else if (g.kind === 'pen') {
      g.points.push(Math.round(p.x), Math.round(p.y))
      setDraft([...g.points])
    }
  }

  function onPointerUp() {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.kind === 'move') flush()
    if (g.kind === 'create') {
      flush()
      const s = doc.get('shapes', g.id)
      if (s && Number(s.w) < 8 && Number(s.h) < 8) {
        const sticky = s.type === 'sticky'
        write(g.id, { w: sticky ? 200 : 160, h: sticky ? 150 : 104 }, true)
      }
      if (s?.type === 'sticky') setEditing(g.id)
      setTool('select')
    }
    if (g.kind === 'pen') {
      setDraft(null)
      if (g.points.length < 4) return
      const xs = g.points.filter((_, i) => i % 2 === 0)
      const ys = g.points.filter((_, i) => i % 2 === 1)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const id = 's' + randomClientId().slice(0, 8)
      remember([[id, ['deleted']]])
      write(
        id,
        {
          type: 'pen',
          x,
          y,
          w: Math.max(...xs) - x,
          h: Math.max(...ys) - y,
          color,
          z: topZ + 1,
          points: g.points.map((v, i) => v - (i % 2 === 0 ? x : y)),
          deleted: false,
        },
        true,
      )
    }
  }

  function onWheel(e: React.WheelEvent) {
    const r = svg.current!.getBoundingClientRect()
    if (e.ctrlKey || e.metaKey) {
      const zoom = Math.min(3, Math.max(0.25, view.zoom * Math.exp(-e.deltaY * 0.01)))
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      setView({ zoom, x: mx - ((mx - view.x) * zoom) / view.zoom, y: my - ((my - view.y) * zoom) / view.zoom })
    } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
  }

  useEffect(() => {
    // pinch-zoom would zoom the whole page; we handle it ourselves
    const el = svg.current
    const stop = (e: WheelEvent) => e.preventDefault()
    el?.addEventListener('wheel', stop, { passive: false })
    return () => el?.removeEventListener('wheel', stop)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing || (e.target as HTMLElement).closest('input, textarea')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        travel(e.shiftKey ? 'redo' : 'undo')
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !readOnly) {
        remember([[selected, ['deleted']]])
        write(selected, { deleted: true }, true)
        setSelected(null)
        return
      }
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase())
      if (t && !mod && !readOnly) setTool(t.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => () => provider?.setAwareness({ pointer: null }), [provider])

  const pointers = collab.peers.filter((p) => p.conn !== provider?.conn && p.state.view === 'board' && p.state.pointer)
  const selectedShape = shapes.find((s) => s.id === selected)
  const dragging = gesture.current?.kind === 'move' ? gesture.current.id : null

  return (
    <div className="absolute inset-0 overflow-hidden bg-ink">
      <svg
        ref={svg}
        className={cn('size-full touch-none select-none', tool === 'hand' ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => provider?.setAwareness({ pointer: null })}
        onWheel={onWheel}
      >
        <defs>
          <pattern
            id="board-dots"
            width={24 * view.zoom}
            height={24 * view.zoom}
            x={view.x}
            y={view.y}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={1} cy={1} r={1} fill="rgb(255 255 255 / 0.09)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#board-dots)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {shapes.map((s) => (
            <g
              key={s.id}
              data-shape={s.id}
              style={{
                transform: `translate(${s.x}px, ${s.y}px)`,
                // remote moves glide instead of teleporting at 30 Hz
                transition: dragging === s.id ? 'none' : 'transform 90ms linear',
              }}
              onDoubleClick={() => s.type === 'sticky' && !readOnly && setEditing(s.id)}
              className={tool === 'select' ? 'cursor-move' : undefined}
            >
              <ShapeView shape={s} editing={editing === s.id} onText={(text) => write(s.id, { text })} />
              {selected === s.id && (
                <rect
                  x={-6}
                  y={-6}
                  width={s.w + 12}
                  height={s.h + 12}
                  rx={10}
                  fill="none"
                  stroke={collab.provider?.user?.color ?? '#ff6a3d'}
                  strokeWidth={1.5 / view.zoom}
                  strokeDasharray="5 4"
                  pointerEvents="none"
                />
              )}
            </g>
          ))}
          {draft && <path d={smoothPath(draft)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}

          {pointers.map((p) => (
            <motion.g
              key={p.conn}
              initial={false}
              animate={{ x: p.state.pointer!.x, y: p.state.pointer!.y }}
              transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.6 }}
              pointerEvents="none"
            >
              <g transform={`scale(${1 / view.zoom})`}>
                <path d="M0 0 L0 17 L4.5 12.5 L8 20 L11 18.6 L7.6 11.4 L13.5 11.4 Z" fill={p.user.color} stroke="#0a0a0c" strokeWidth={1.2} />
                <foreignObject x={14} y={16} width={160} height={28}>
                  <div
                    className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-ink"
                    style={{ background: p.user.color }}
                  >
                    {p.user.name}
                  </div>
                </foreignObject>
              </g>
            </motion.g>
          ))}
        </g>
      </svg>

      {!readOnly && (
        <div className="glass absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-line p-1.5 shadow-2xl">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              title={`${t.label} (${t.key.toUpperCase()})`}
              onClick={() => setTool(t.id)}
              className={cn(
                'relative grid size-9 place-items-center rounded-xl transition',
                tool === t.id ? 'text-ink' : 'text-dim hover:bg-white/[0.06] hover:text-fg',
              )}
            >
              {tool === t.id && (
                <motion.span layoutId="board-tool" className="absolute inset-0 rounded-xl bg-fg" transition={{ type: 'spring', stiffness: 600, damping: 40 }} />
              )}
              <t.icon className="relative size-[17px]" />
            </button>
          ))}
          <span className="mx-1.5 h-6 w-px bg-line-strong" />
          {COLORS.map((c) => (
            <button
              key={c}
              title="Colour"
              onClick={() => {
                setColor(c)
                if (selectedShape) {
                  remember([[selectedShape.id, ['color']]])
                  write(selectedShape.id, { color: c }, true)
                }
              }}
              className="grid size-7 place-items-center rounded-full"
            >
              <span
                className={cn('size-[18px] rounded-full transition', color === c ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-coal' : 'hover:scale-110')}
                style={{ background: c }}
              />
            </button>
          ))}
          {selectedShape && (
            <>
              <span className="mx-1.5 h-6 w-px bg-line-strong" />
              <button
                title="Delete (⌫)"
                onClick={() => {
                  remember([[selectedShape.id, ['deleted']]])
                  write(selectedShape.id, { deleted: true }, true)
                  setSelected(null)
                }}
                className="grid size-9 place-items-center rounded-xl text-dim transition hover:bg-danger/15 hover:text-danger"
              >
                <Trash2 className="size-[17px]" />
              </button>
            </>
          )}
        </div>
      )}

      <div className="glass absolute bottom-4 right-4 flex items-center gap-1 rounded-xl border border-line p-1 text-dim">
        <button className="grid size-7 place-items-center rounded-lg hover:bg-white/[0.06]" onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.25, v.zoom / 1.2) }))}>
          <Minus className="size-4" />
        </button>
        <button className="w-12 font-mono text-[11px] hover:text-fg" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>
          {Math.round(view.zoom * 100)}%
        </button>
        <button className="grid size-7 place-items-center rounded-lg hover:bg-white/[0.06]" onClick={() => setView((v) => ({ ...v, zoom: Math.min(3, v.zoom * 1.2) }))}>
          <Plus className="size-4" />
        </button>
      </div>

      {!shapes.length && !draft && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-display text-3xl text-dim">An empty canvas.</p>
            <p className="mt-2 text-sm text-faint">Pick a tool above — press R, O, S or P — and draw. Everyone in the room sees it live.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function ShapeView({ shape: s, editing, onText }: { shape: Shape; editing: boolean; onText: (t: string) => void }) {
  if (s.type === 'pen') {
    return (
      <>
        <path d={smoothPath(s.points ?? [])} fill="none" stroke="transparent" strokeWidth={14} />
        <path d={smoothPath(s.points ?? [])} fill="none" stroke={s.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </>
    )
  }
  if (s.type === 'ellipse') {
    return (
      <ellipse cx={s.w / 2} cy={s.h / 2} rx={Math.max(1, s.w / 2)} ry={Math.max(1, s.h / 2)} fill={s.color + '22'} stroke={s.color} strokeWidth={2} />
    )
  }
  if (s.type === 'sticky') {
    return (
      <>
        <rect width={s.w} height={s.h} rx={6} fill={s.color} style={{ filter: 'drop-shadow(0 10px 18px rgb(0 0 0 / 0.45))' }} />
        <foreignObject x={0} y={0} width={s.w} height={s.h}>
          {editing ? (
            <textarea
              autoFocus
              defaultValue={s.text}
              onChange={(e) => onText(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              className="size-full resize-none bg-transparent p-3.5 text-[15px] font-medium leading-snug text-ink outline-none"
            />
          ) : (
            <div className="size-full overflow-hidden whitespace-pre-wrap p-3.5 text-[15px] font-medium leading-snug text-ink">
              {s.text || <span className="opacity-40">Double-click to write</span>}
            </div>
          )}
        </foreignObject>
      </>
    )
  }
  return <rect width={Math.max(1, s.w)} height={Math.max(1, s.h)} rx={10} fill={s.color + '1f'} stroke={s.color} strokeWidth={2} />
}
