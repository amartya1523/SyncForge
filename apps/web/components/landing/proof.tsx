'use client'

import { animate, motion, useInView } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { rise, stagger } from './primitives'

function Counter({ to, decimals = 0, prefix = '' }: { to: number; decimals?: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, to, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setValue,
    })
    return () => controls.stop()
  }, [inView, to])

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  )
}

const STATS: Array<{ value: React.ReactNode; label: string; note: string }> = [
  {
    value: (
      <>
        <Counter to={100} />
        <span className="text-dim"> bots</span>
      </>
    ),
    label: '2 gateway nodes — converged',
    note: 'scripts/loadtest.ts',
  },
  {
    value: (
      <>
        <Counter to={22} />
        <span className="text-dim">/</span>
        <Counter to={48} />
        <span className="text-[0.5em] text-dim"> ms</span>
      </>
    ),
    label: 'p50 / p99 edit → peer latency',
    note: '100 bots, 2 edits/s each',
  },
  {
    value: (
      <>
        <Counter to={3000} />
      </>
    ),
    label: 'fuzzed schedules, 0 divergences',
    note: 'shuffled, duplicated, partitioned',
  },
  {
    value: (
      <>
        <span className="text-dim">~</span>
        <Counter to={1} />
        <span className="text-[0.5em] text-dim"> µs</span>
      </>
    ),
    label: 'per keystroke on a 40k-char doc',
    note: 'packages/crdt bench',
  },
]

export function Proof() {
  return (
    <section className="relative border-y border-line bg-coal/40">
      <motion.ul
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mx-auto grid max-w-6xl grid-cols-2 lg:grid-cols-4"
      >
        {STATS.map((s, i) => (
          <motion.li
            key={s.label}
            variants={rise}
            className={
              'relative px-4 py-9 sm:px-8 sm:py-12 ' +
              (i % 2 === 1 ? 'border-l border-line ' : '') +
              (i >= 2 ? 'border-t border-line lg:border-t-0 ' : '') +
              (i === 2 ? 'lg:border-l ' : '')
            }
          >
            <div className="font-display text-[40px] leading-none tracking-tight sm:text-[54px]">{s.value}</div>
            <p className="mt-3 text-[13.5px] leading-snug text-fg/90 sm:text-[14.5px]">{s.label}</p>
            <p className="mt-1.5 font-mono text-[10.5px] text-faint">{s.note}</p>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  )
}
