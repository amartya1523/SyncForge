'use client'

import { motion } from 'motion/react'
import { CloudOff, Database, History, PenTool, ShieldCheck, Type } from 'lucide-react'
import { useRef } from 'react'
import { cn } from '@/lib/cn'
import { SectionHeading, rise, stagger } from './primitives'

/** Card whose border and surface light up under the pointer. */
function GlowCard({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLLIElement>(null)
  function onMove(e: React.PointerEvent) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <motion.li
      ref={ref}
      variants={rise}
      onPointerMove={onMove}
      className={cn('group relative overflow-hidden rounded-2xl border border-line bg-coal/70', className)}
    >
      {/* surface glow */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(420px_circle_at_var(--mx)_var(--my),rgb(255_106_61/0.10),transparent_45%)]" />
      {/* border glow, masked to the 1px ring */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl p-px opacity-0 transition-opacity duration-300 [mask-composite:exclude] [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] group-hover:opacity-100 [background:radial-gradient(260px_circle_at_var(--mx)_var(--my),rgb(255_181_71/0.6),transparent_60%)]" />
      <div className="relative flex h-full flex-col">{children}</div>
    </motion.li>
  )
}

function CardText({ icon: Icon, title, body }: { icon: typeof Type; title: string; body: string }) {
  return (
    <div className="p-6 sm:p-7">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg border border-line-strong bg-white/[0.03]">
          <Icon className="size-4 text-flare" />
        </span>
        <h3 className="text-[15.5px] font-medium tracking-tight">{title}</h3>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-dim text-pretty">{body}</p>
    </div>
  )
}

export function Features() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
      <SectionHeading
        eyebrow="What’s in the box"
        title={
          <>
            Everything a shared doc needs, <em className="text-gradient pr-1">forged</em> by hand.
          </>
        }
        lede="One engine underneath, six capabilities on top. No third-party sync library anywhere in the stack."
      />

      <motion.ul
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        <GlowCard className="lg:col-span-2">
          <CardText
            icon={Type}
            title="Conflict-free text, live cursors"
            body="A YATA-style sequence CRDT keeps concurrent runs intact — HELLO and WORLD typed at one spot never interleave. Cursors are relative positions, so they ride along with remote edits."
          />
          <EditorVisual />
        </GlowCard>

        <GlowCard>
          <CardText
            icon={CloudOff}
            title="Offline-first"
            body="Every edit lands in IndexedDB first. Close the laptop, keep typing, reconnect a day later — the delta syncs itself."
          />
          <OfflineVisual />
        </GlowCard>

        <GlowCard>
          <CardText
            icon={History}
            title="Version time-travel"
            body="Diff any version against now. Restore without losing anyone’s concurrent work."
          />
          <VersionVisual />
        </GlowCard>

        <GlowCard className="lg:col-span-2">
          <CardText
            icon={PenTool}
            title="Multiplayer whiteboard"
            body="Shapes are last-writer-wins registers ordered by Lamport clocks — per field, so one person dragging and another recolouring both win."
          />
          <WhiteboardVisual />
        </GlowCard>

        <GlowCard className="lg:col-span-2">
          <CardText
            icon={ShieldCheck}
            title="Access control, enforced per op"
            body="Owner, editor, commenter, viewer — checked on the server for every single operation. An op claiming someone else’s authorship is rejected before it touches the log."
          />
          <AccessVisual />
        </GlowCard>

        <GlowCard>
          <CardText
            icon={Database}
            title="Horizontal scaling"
            body="Any gateway can serve any doc: Redis fans ops out, Postgres keeps the op log, compaction is merge-safe."
          />
          <ScaleVisual />
        </GlowCard>
      </motion.ul>
    </section>
  )
}

/* ------------------------------------------------------------------ visuals */

function Stage({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('mx-6 mb-6 mt-auto overflow-hidden rounded-xl border border-line bg-ink/70 sm:mx-7 sm:mb-7', className)}>
      {children}
    </div>
  )
}

function EditorVisual() {
  return (
    <Stage className="px-5 pb-4 pt-6">
      <p className="text-[14.5px] leading-[2.4] text-fg/85">
        Strong eventual consistency means two replicas
        <span className="remote-caret" style={{ '--caret': 'var(--color-tide)' } as React.CSSProperties}>
          <span>Bilal</span>
        </span>{' '}
        that saw the same ops are <span className="bg-ember/15 text-ember">identical</span>
        <span className="remote-caret" style={{ '--caret': 'var(--color-ember)' } as React.CSSProperties}>
          <span>Asha</span>
        </span>
        , in any order
        <motion.span
          className="inline-block overflow-hidden whitespace-nowrap align-bottom text-violet"
          animate={{ width: ['0ch', '13ch', '13ch', '0ch'] }}
          transition={{ duration: 5, times: [0, 0.4, 0.8, 1], repeat: Infinity, ease: 'linear' }}
        >
          , any number of
        </motion.span>
        <span className="remote-caret" style={{ '--caret': 'var(--color-violet)' } as React.CSSProperties}>
          <span>Chen</span>
        </span>{' '}
        times.
      </p>
    </Stage>
  )
}

function OfflineVisual() {
  return (
    <Stage className="p-4">
      <div className="flex items-center justify-between font-mono text-[11px]">
        <motion.span
          className="inline-flex items-center gap-1.5"
          animate={{ color: ['#5d5d66', '#5d5d66', '#5eead4', '#5eead4'] }}
          transition={{ duration: 4, times: [0, 0.6, 0.65, 1], repeat: Infinity }}
        >
          <span className="size-1.5 rounded-full bg-current" />
          <motion.span animate={{ opacity: [1, 1, 0, 0] }} transition={{ duration: 4, times: [0, 0.6, 0.62, 1], repeat: Infinity }}>
            offline
          </motion.span>
        </motion.span>
        <span className="text-faint">IndexedDB</span>
      </div>
      <div className="mt-3 flex h-6 gap-1">
        {Array.from({ length: 9 }, (_, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-[4px] bg-violet/70"
            animate={{ opacity: [0, 0, 1, 1, 0], y: [4, 4, 0, 0, -10] }}
            transition={{
              duration: 4,
              times: [0, (i / 9) * 0.55, (i / 9) * 0.55 + 0.04, 0.66 + i * 0.01, 0.8 + i * 0.01],
              repeat: Infinity,
            }}
          />
        ))}
      </div>
      <p className="mt-3 font-mono text-[10.5px] text-faint">queue → reconnect → Δ sync</p>
    </Stage>
  )
}

function VersionVisual() {
  return (
    <Stage className="p-4">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        {[8, 26, 44, 63, 82, 96].map((x) => (
          <span key={x} className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-faint" style={{ left: `${x}%` }} />
        ))}
        <motion.span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-flare shadow-[0_0_14px_var(--color-flare)]"
          animate={{ left: ['96%', '26%', '26%', '96%'] }}
          transition={{ duration: 6, times: [0, 0.3, 0.7, 1], repeat: Infinity, ease: [0.65, 0, 0.35, 1] }}
        />
      </div>
      <div className="mt-3 space-y-1 font-mono text-[11px]">
        <p className="rounded bg-tide/10 px-2 py-0.5 text-tide">+ restored: "until every peer…"</p>
        <p className="rounded bg-danger/10 px-2 py-0.5 text-danger line-through decoration-danger/60">− "and pray"</p>
      </div>
    </Stage>
  )
}

function WhiteboardVisual() {
  return (
    <Stage className="dot-grid relative h-44">
      <svg viewBox="0 0 520 176" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid meet">
        <motion.rect
          x={60}
          y={40}
          width={120}
          height={80}
          rx={14}
          fill="rgb(255 106 61 / 0.12)"
          strokeWidth={1.5}
          animate={{ x: [60, 120, 120, 60], stroke: ['#ff6a3d', '#ff6a3d', '#5eead4', '#ff6a3d'] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <circle cx={360} cy={88} r={42} fill="rgb(167 139 250 / 0.12)" stroke="#a78bfa" strokeWidth={1.5} />
        <path d="M250 70 C 280 40, 300 130, 330 100" fill="none" stroke="#ffb547" strokeWidth={2} strokeLinecap="round" strokeDasharray="4 6" />
        <motion.g animate={{ x: [0, 60, 60, 0], y: [0, 0, 0, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
          <Cursor x={176} y={116} color="#ff6a3d" name="Asha · x" />
        </motion.g>
        <motion.g animate={{ x: [0, -20, 10, 0], y: [0, 10, -6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
          <Cursor x={200} y={30} color="#5eead4" name="Bilal · stroke" />
        </motion.g>
      </svg>
      <p className="absolute bottom-3 right-4 font-mono text-[10.5px] text-faint">LWW per field · Lamport ordered</p>
    </Stage>
  )
}

function Cursor({ x, y, color, name }: { x: number; y: number; color: string; name: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 L0 16 L4.5 12 L8 19 L10.5 18 L7 11 L13 11 Z" fill={color} stroke="#0a0a0c" strokeWidth={1} />
      <rect x={12} y={16} rx={5} height={17} width={name.length * 6.2 + 12} fill={color} />
      <text x={18} y={28} fontSize={10.5} fontWeight={600} fill="#0a0a0c" fontFamily="var(--font-sans)">
        {name}
      </text>
    </g>
  )
}

const ROLES = [
  { role: 'owner', perms: [true, true, true, true] },
  { role: 'editor', perms: [true, true, true, false] },
  { role: 'commenter', perms: [true, false, true, false] },
  { role: 'viewer', perms: [true, false, false, false] },
]

function AccessVisual() {
  return (
    <Stage className="grid gap-4 p-4 sm:grid-cols-[1.2fr_1fr]">
      <table className="w-full font-mono text-[11px]">
        <thead>
          <tr className="text-faint">
            <th className="pb-2 text-left font-normal">role</th>
            {['read', 'edit', 'comment', 'share'].map((h) => (
              <th key={h} className="pb-2 text-center font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLES.map((r) => (
            <tr key={r.role} className="border-t border-line">
              <td className="py-1.5 text-dim">{r.role}</td>
              {r.perms.map((ok, i) => (
                <td key={i} className={cn('py-1.5 text-center', ok ? 'text-tide' : 'text-faint/60')}>
                  {ok ? '●' : '·'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col justify-center gap-2 font-mono text-[11px]">
        <p className="rounded-lg border border-line px-2.5 py-1.5 text-dim">
          <span className="text-tide">✓</span> ins by <span className="text-fg">asha</span> as asha
        </p>
        <motion.p
          className="rounded-lg border border-danger/30 bg-danger/[0.06] px-2.5 py-1.5 text-danger"
          animate={{ x: [0, -3, 3, -2, 2, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2.5 }}
        >
          ✕ ins by viewer as asha — rejected
        </motion.p>
      </div>
    </Stage>
  )
}

function ScaleVisual() {
  const node = 'rounded-md border border-line-strong bg-white/[0.03] px-2 py-1 text-center'
  return (
    <Stage className="p-4 font-mono text-[10.5px] text-dim">
      <div className="grid grid-cols-2 gap-2">
        <div className={node}>node-a</div>
        <div className={node}>node-b</div>
      </div>
      <div className="relative mx-auto my-1.5 h-5 w-px bg-line-strong">
        <motion.span
          className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-ember shadow-[0_0_8px_var(--color-ember)]"
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeIn' }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={cn(node, 'border-danger/30 text-danger/90')}>redis pub/sub</div>
        <div className={cn(node, 'border-tide/30 text-tide/90')}>postgres log</div>
      </div>
    </Stage>
  )
}
