'use client'

import { Check, Radio } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

interface Props {
  converged: boolean
  inFlight: number
  pending: number
  hash: string
}

export function ConvergenceBanner({ converged, inFlight, pending, hash }: Props) {
  return (
    <div className="relative min-h-[76px]">
      <AnimatePresence mode="wait" initial={false}>
        {converged ? (
          <motion.div
            key="converged"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-tide/30 bg-tide/[0.07] px-5 py-4 shadow-[0_0_80px_-30px_var(--color-tide)]"
          >
            <span className="grid size-10 place-items-center rounded-full bg-tide text-ink shadow-[0_0_28px_-2px_var(--color-tide)]">
              <Check className="size-5" strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[30px] leading-none text-tide italic">Converged</div>
              <div className="mt-1 text-[12.5px] text-dim">All three replicas hold identical state. Nothing in flight, nothing buffered.</div>
            </div>
            <div className="rounded-lg border border-tide/25 bg-ink/50 px-2.5 py-1 font-mono text-[12px] text-tide">#{hash}</div>
          </motion.div>
        ) : (
          <motion.div
            key="diverged"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-flare/25 bg-flare/[0.06] px-5 py-4 shadow-[0_0_80px_-36px_var(--color-flare)]"
          >
            <span className="grid size-10 place-items-center rounded-full border border-flare/40 bg-flare/10 text-flare">
              <Radio className="size-5 animate-pulse-soft" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[30px] leading-none text-flare">
                Diverged <span className="text-flare/60">·</span> {inFlight} packet{inFlight === 1 ? '' : 's'} in flight
              </div>
              <div className="mt-1 text-[12.5px] text-dim">
                {inFlight > 0
                  ? 'Replicas disagree while updates are on the wire.'
                  : pending > 0
                    ? `${pending} op${pending === 1 ? '' : 's'} buffered, waiting on lost dependencies. Sync to heal.`
                    : 'Packets were lost and nothing is retrying. Hit Sync now or turn on anti-entropy.'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
