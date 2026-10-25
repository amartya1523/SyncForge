'use client'

import { motion } from 'motion/react'
import { History, MessageSquare, WifiOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SectionHeading, rise, stagger } from './primitives'

interface Scenario {
  who: string
  name: string
  color: string
  action: string
  how: string
  mono: string
  span: string
  sample: React.ReactNode
}

const SCENARIOS: Scenario[] = [
  {
    who: 'A',
    name: 'Asha',
    color: 'var(--color-ember)',
    action: 'writes a paragraph',
    how: 'Every character gets an id and remembers the neighbours it was typed between, so other people’s cursors never jump.',
    mono: 'id = (client, clock) · origin ← left, right',
    span: 'lg:col-span-3',
    sample: (
      <>
        Replicas gossip ops <span className="text-ember">until every peer has seen them</span>
        <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-blink bg-ember" />
      </>
    ),
  },
  {
    who: 'B',
    name: 'Bilal',
    color: 'var(--color-tide)',
    action: 'deletes words inside it — at the same moment',
    how: 'Deletes leave tombstones, and A’s new characters still point at them as origins — so they land in the right place.',
    mono: 'delete → tombstone, never a hole',
    span: 'lg:col-span-3',
    sample: (
      <>
        Replicas <span className="text-faint line-through decoration-tide decoration-2">quietly</span> gossip ops{' '}
        <span className="text-faint line-through decoration-tide decoration-2">and pray</span> until every peer has seen them
      </>
    ),
  },
  {
    who: 'C',
    name: 'Chen',
    color: 'var(--color-violet)',
    action: 'is offline on a train',
    how: 'Edits queue in IndexedDB. On reconnect, both sides swap state vectors and send only what the other is missing.',
    mono: 'sv {a:182, b:40} → Δ 37 ops',
    span: 'lg:col-span-2',
    sample: (
      <span className="inline-flex items-center gap-2">
        <WifiOff className="size-3.5 text-violet" />
        <span>offline · 37 ops queued</span>
      </span>
    ),
  },
  {
    who: 'D',
    name: 'Dana',
    color: 'var(--color-flare)',
    action: 'leaves comments',
    how: 'A comment anchors to character ids, not indices, so it stays on its words while the text around it churns.',
    mono: 'anchor { start: a:91, end: a:104 }',
    span: 'lg:col-span-2',
    sample: (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="comment-mark">every peer</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-flare/10 px-1.5 py-0.5 text-[11px] text-flare">
          <MessageSquare className="size-3" /> cite the paper?
        </span>
      </span>
    ),
  },
  {
    who: 'E',
    name: 'Eli',
    color: '#f472b6',
    action: 'restores last week’s version',
    how: 'Restore is a new forward operation, not a rewind — A, B, C and D’s concurrent work survives it.',
    mono: 'restore(v12) = ops on top of now',
    span: 'lg:col-span-2',
    sample: (
      <span className="inline-flex items-center gap-2">
        <History className="size-3.5 text-[#f472b6]" />
        <span>v12</span>
        <span className="h-px w-8 bg-gradient-to-r from-[#f472b6] to-transparent" />
        <span className="text-fg">now + v12</span>
      </span>
    ),
  },
]

export function FivePerson() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
      <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <SectionHeading
          eyebrow="The brief"
          title={
            <>
              The <em className="text-gradient pr-1">five-person</em> problem.
            </>
          }
          lede="Five people, one technical document, all at once. Each of them breaks a naïve sync layer in a different way. Here is what each one does — and why SyncForge doesn’t flinch."
        />
        <Faces />
      </div>

      <motion.ul
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        {SCENARIOS.map((s, i) => (
          <motion.li
            key={s.who}
            variants={rise}
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-coal/70 p-5 sm:p-6',
              s.span,
              i === 4 && 'sm:col-span-2 lg:col-span-2',
            )}
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
              style={{ background: s.color }}
            />
            <div className="flex items-center gap-3">
              <span
                className="grid size-9 place-items-center rounded-full font-display text-[18px] italic text-ink shadow-[0_0_0_4px_var(--color-coal)]"
                style={{ background: s.color }}
              >
                {s.who}
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-medium">{s.name}</p>
                <p className="text-[13px] text-dim">{s.action}</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-line bg-ink/60 px-3.5 py-3 text-[13.5px] leading-relaxed text-dim">
              {s.sample}
            </div>

            <p className="mt-5 flex-1 text-[14px] leading-relaxed text-fg/85 text-pretty">{s.how}</p>
            <p className="mt-4 border-t border-dashed border-line pt-3 font-mono text-[11px]" style={{ color: s.color }}>
              <span className="text-faint">how → </span>
              {s.mono}
            </p>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  )
}

function Faces() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {SCENARIOS.map((s, i) => (
          <motion.span
            key={s.who}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 300, damping: 22 }}
            className="grid size-9 place-items-center rounded-full font-display text-[17px] italic text-ink ring-2 ring-ink"
            style={{ background: s.color }}
          >
            {s.who}
          </motion.span>
        ))}
      </div>
      <span className="font-mono text-[11px] text-faint">5 replicas · 1 result</span>
    </div>
  )
}
