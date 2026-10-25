'use client'

import { Doc, type StateVector } from '@syncforge/crdt'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Check } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/cn'

/*
 * The hero animation. Nothing here is faked: two real Doc replicas start from the
 * same "HELLO", edit concurrently, swap state-vector deltas, and the rendered
 * letters are whatever doc.inspect() says — keyed by CRDT item id so motion can
 * glide each character to its merged position.
 */

type Phase = 'base' | 'typing' | 'sending' | 'merged'

interface Glyph {
  key: string
  char: string
  client: string
}

interface ReplicaView {
  glyphs: Glyph[]
  caret: string | null
  sv: StateVector
}

const AUTHOR: Record<string, { color: string; label: string }> = {
  a: { color: 'var(--color-ember)', label: 'A' },
  b: { color: 'var(--color-tide)', label: 'B' },
}

// interleaved keystrokes: A appends " WORLD", B types "Y " right after "HE"
const SCRIPT: Array<{ who: 'a' | 'b'; char: string; at: (d: Doc) => number }> = [
  { who: 'a', char: ' ', at: (d) => d.length },
  { who: 'b', char: 'Y', at: () => 2 },
  { who: 'a', char: 'W', at: (d) => d.length },
  { who: 'a', char: 'O', at: (d) => d.length },
  { who: 'b', char: ' ', at: () => 3 },
  { who: 'a', char: 'R', at: (d) => d.length },
  { who: 'a', char: 'L', at: (d) => d.length },
  { who: 'a', char: 'D', at: (d) => d.length },
]

function view(doc: Doc, caret: string | null): ReplicaView {
  const glyphs = doc
    .inspect()
    .filter((it) => !it.deleted)
    .map((it) => ({ key: `${it.id.client}:${it.id.clock}`, char: it.char, client: it.id.client }))
  return { glyphs, caret, sv: doc.stateVector() }
}

function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(min-width: 768px)')
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia('(min-width: 768px)').matches,
    () => true,
  )
}

export function MergeDemo({ className }: { className?: string }) {
  const [phase, setPhase] = useState<Phase>('base')
  const [cycle, setCycle] = useState(0)
  const [a, setA] = useState<ReplicaView | null>(null)
  const [b, setB] = useState<ReplicaView | null>(null)
  const [packets, setPackets] = useState<{ a: string; b: string } | null>(null)
  const [fading, setFading] = useState(false)
  const wide = useWide()

  useEffect(() => {
    let cancelled = false
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

    async function loop() {
      while (!cancelled) {
        const base = new Doc({ clientId: 'base' })
        base.insert(0, 'HELLO')
        const docA = new Doc({ clientId: 'a' })
        const docB = new Doc({ clientId: 'b' })
        docA.apply(base.encode())
        docB.apply(base.encode())

        let caretA: string | null = 'base:4'
        let caretB: string | null = 'base:1'
        setFading(false)
        setCycle((c) => c + 1)
        setPhase('base')
        setPackets(null)
        setA(view(docA, caretA))
        setB(view(docB, caretB))
        await sleep(1300)
        if (cancelled) return

        setPhase('typing')
        for (const step of SCRIPT) {
          const doc = step.who === 'a' ? docA : docB
          const op = doc.insert(step.at(doc), step.char)
          const key = op ? `${op.id.client}:${op.id.clock}` : null
          if (step.who === 'a') {
            caretA = key
            setA(view(docA, caretA))
          } else {
            caretB = key
            setB(view(docB, caretB))
          }
          await sleep(170 + Math.random() * 120)
          if (cancelled) return
        }
        await sleep(650)
        if (cancelled) return

        // each side asks "what am I missing?" with its state vector
        const toB = docA.diff(docB.stateVector())
        const toA = docB.diff(docA.stateVector())
        const label = (ops: typeof toB) =>
          ops.map((op) => (op.t === 'ins' ? `"${op.s}"` : op.t)).join(' + ')
        setPhase('sending')
        setPackets({ a: label(toB), b: label(toA) })
        await sleep(1500)
        if (cancelled) return

        docB.apply(toB)
        docA.apply(toA)
        setPhase('merged')
        setPackets(null)
        setA(view(docA, caretA))
        setB(view(docB, caretB))
        await sleep(4200)
        if (cancelled) return
        // dissolve the merged text before the next round starts
        setFading(true)
        await sleep(450)
      }
    }

    loop()
    return () => {
      cancelled = true
    }
  }, [])

  const converged = phase === 'merged'

  return (
    <div className={cn('relative', className)}>
      {/* soft forge glow under the cards */}
      <div className="pointer-events-none absolute -inset-x-10 -inset-y-16 -z-10 bg-[radial-gradient(60%_50%_at_50%_50%,rgb(255_106_61/0.14),transparent_70%)]" />

      <div className="relative grid gap-4 md:grid-cols-[1fr_88px_1fr] md:gap-0">
        <ReplicaCard who="a" name="Replica A" view={a} phase={phase} cycle={cycle} fading={fading} />
        <Wire wide={wide} active={phase === 'sending'} converged={converged} />
        <ReplicaCard who="b" name="Replica B" view={b} phase={phase} cycle={cycle} fading={fading} />

        {/* packets fly from one card's centre to the other's */}
        <AnimatePresence>
          {packets && (
            <>
              <Packet key={`pa-${cycle}`} label={packets.a} color="var(--color-ember)" wide={wide} forward />
              <Packet key={`pb-${cycle}`} label={packets.b} color="var(--color-tide)" wide={wide} />
            </>
          )}
        </AnimatePresence>
      </div>

      <Timeline phase={phase} />
    </div>
  )
}

function ReplicaCard({
  who,
  name,
  view,
  phase,
  cycle,
  fading,
}: {
  who: 'a' | 'b'
  name: string
  view: ReplicaView | null
  phase: Phase
  cycle: number
  fading: boolean
}) {
  const me = AUTHOR[who]
  const converged = phase === 'merged'

  return (
    <motion.div
      animate={{
        borderColor: converged ? 'rgb(94 234 212 / 0.28)' : 'rgb(255 255 255 / 0.075)',
      }}
      transition={{ duration: 0.6 }}
      className="relative overflow-hidden rounded-2xl border bg-coal/80 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)]"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${me.color}, transparent)`, opacity: 0.5 }}
      />
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-ink"
            style={{ background: me.color }}
          >
            {me.label}
          </span>
          <span className="truncate text-[13px] font-medium">{name}</span>
          <span className="hidden font-mono text-[11px] text-faint sm:inline">client:{who}</span>
        </div>
        <StatusChip phase={phase} who={who} />
      </header>

      <div className="dot-grid relative flex min-h-[132px] items-center px-5 py-7 sm:min-h-[150px] sm:px-6">
        <motion.div
          key={cycle}
          initial={{ opacity: 0 }}
          animate={fading ? { opacity: 0, filter: 'blur(6px)' } : { opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.35 }}
          className="flex flex-wrap items-end font-display text-[36px] leading-none sm:text-[46px]"
        >
          <LayoutGroup id={`replica-${who}`}>
            {view?.glyphs.map((g) => (
              <Letter key={g.key} glyph={g} withCaret={view.caret === g.key} caretColor={me.color} />
            ))}
          </LayoutGroup>
        </motion.div>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 font-mono text-[11px] text-faint">
        <span className="truncate">
          sv{' '}
          {view &&
            Object.entries(view.sv)
              .sort(([x], [y]) => x.localeCompare(y))
              .map(([k, v]) => `${k}:${v}`)
              .join(' ')}
        </span>
        <span>{view?.glyphs.length ?? 0} chars</span>
      </footer>
    </motion.div>
  )
}

function Letter({ glyph, withCaret, caretColor }: { glyph: Glyph; withCaret: boolean; caretColor: string }) {
  const author = AUTHOR[glyph.client]
  const space = glyph.char === ' '
  return (
    <motion.span
      layout="position"
      initial={{ opacity: 0, y: -14, scale: 0.6, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
      className="relative inline-flex items-end"
    >
      <span
        className={cn('relative inline-block', space && 'w-[0.32em]')}
        style={{ color: author ? author.color : 'var(--color-fg)' }}
      >
        {space ? ' ' : glyph.char}
        {/* authored glyphs get a tiny underline so even spaces show who typed them */}
        {author && (
          <span
            className="absolute inset-x-[0.06em] -bottom-2 h-[2px] rounded-full opacity-60"
            style={{ background: author.color }}
          />
        )}
      </span>
      {withCaret && (
        <motion.span
          layoutId="caret"
          className="ml-[1px] mb-[0.05em] inline-block h-[0.9em] w-[2px] animate-blink rounded-full"
          style={{ background: caretColor }}
          transition={{ type: 'spring', stiffness: 600, damping: 40 }}
        />
      )}
    </motion.span>
  )
}

function StatusChip({ phase, who }: { phase: Phase; who: 'a' | 'b' }) {
  const text = {
    base: 'in sync',
    typing: 'editing…',
    sending: 'Δ exchanging',
    merged: 'converged',
  }[phase]
  const color = phase === 'merged' ? 'var(--color-tide)' : phase === 'typing' ? AUTHOR[who].color : 'var(--color-dim)'
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={phase}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25 }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white/[0.03] px-2 py-0.5 font-mono text-[10.5px]"
        style={{ color }}
      >
        {phase === 'merged' ? (
          <Check className="size-3" strokeWidth={3} />
        ) : (
          <span className="size-1.5 animate-pulse-soft rounded-full" style={{ background: color }} />
        )}
        {text}
      </motion.span>
    </AnimatePresence>
  )
}

/** The link between replicas: dashed line, glows while traffic is in flight. */
function Wire({ wide, active, converged }: { wide: boolean; active: boolean; converged: boolean }) {
  return (
    <div className="relative flex h-10 items-center justify-center md:h-auto">
      <div
        className={cn(
          'absolute border-dashed transition-colors duration-500',
          wide ? 'inset-x-2 top-1/2 border-t' : 'inset-y-0 left-1/2 border-l',
          active ? 'border-flare/50' : 'border-line-strong',
        )}
      />
      <AnimatePresence>
        {converged && (
          <motion.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="relative z-10 grid size-9 place-items-center rounded-full border border-tide/40 bg-ink text-tide shadow-[0_0_30px_-6px_var(--color-tide)]"
          >
            <Check className="size-4" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

function Packet({ label, color, wide, forward }: { label: string; color: string; wide: boolean; forward?: boolean }) {
  const from = forward ? '25%' : '75%'
  const to = forward ? '75%' : '25%'
  // two lanes so the packets pass each other instead of colliding
  const lane = forward ? '42%' : '58%'
  const axis = wide
    ? { initial: { left: from, top: lane }, animate: { left: to, top: lane } }
    : { initial: { top: from, left: forward ? '38%' : '62%' }, animate: { top: to, left: forward ? '38%' : '62%' } }

  return (
    <motion.div
      initial={{ ...axis.initial, opacity: 0, scale: 0.7 }}
      animate={{ ...axis.animate, opacity: [0, 1, 1, 0], scale: [0.7, 1, 1, 0.9] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.35, ease: [0.65, 0, 0.35, 1], times: [0, 0.15, 0.85, 1] }}
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
    >
      <span
        className="inline-flex items-center gap-1.5 whitespace-pre rounded-full border bg-ink/90 px-2.5 py-1 font-mono text-[11px] backdrop-blur"
        style={{ borderColor: color, color, boxShadow: `0 0 24px -4px ${color}` }}
      >
        <span className="size-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
    </motion.div>
  )
}

const STEPS: Array<{ id: Phase[]; label: string }> = [
  { id: ['base', 'typing'], label: 'concurrent edits' },
  { id: ['sending'], label: 'swap state-vector deltas' },
  { id: ['merged'], label: 'identical result, no arbiter' },
]

function Timeline({ phase }: { phase: Phase }) {
  const at = STEPS.findIndex((s) => s.id.includes(phase))
  return (
    <ol className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
      {STEPS.map((s, i) => (
        <li key={s.label} className="relative">
          <div className="h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full origin-left rounded-full bg-gradient-to-r from-ember to-flare"
              animate={{ scaleX: i < at ? 1 : i === at ? 1 : 0, opacity: i <= at ? 1 : 0 }}
              transition={{ duration: i === at ? 0.8 : 0.3, ease: 'easeOut' }}
            />
          </div>
          <p className={cn('mt-2 font-mono text-[10.5px] transition-colors sm:text-[11px]', i === at ? 'text-fg' : 'text-faint')}>
            <span className="text-faint">0{i + 1}</span> {s.label}
          </p>
        </li>
      ))}
    </ol>
  )
}
