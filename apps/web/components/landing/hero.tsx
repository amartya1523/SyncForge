'use client'

import { motion } from 'motion/react'
import { ArrowRight, FlaskConical } from 'lucide-react'
import { MergeDemo } from './merge-demo'
import { LinkButton } from './primitives'

const ease = [0.22, 1, 0.36, 1] as const

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* backdrop: dot grid fading out, ember bloom from the top */}
      <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-280px] h-[560px] w-[900px] max-w-[160vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_106_61/0.22),rgb(255_181_71/0.06)_55%,transparent)] blur-2xl" />

      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24 lg:pb-32">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.09 } } }}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.a
            href="#how"
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }}
            className="group inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-1 pl-1 pr-3 text-[12.5px] text-dim transition-colors hover:border-line-strong hover:text-fg"
          >
            <span className="rounded-full bg-ember/15 px-2 py-0.5 font-mono text-[10.5px] text-ember">CRDT</span>
            Written from scratch — no Yjs, no Automerge
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </motion.a>

          <motion.h1
            variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.9, ease } } }}
            className="mt-8 font-display text-[54px] leading-[0.95] tracking-[-0.02em] text-balance sm:text-[84px] lg:text-[100px]"
          >
            Many hands.
            <br />
            <em className="text-gradient pr-2">One</em> document.
          </motion.h1>

          <motion.p
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease } } }}
            className="mx-auto mt-7 max-w-xl text-[16px] leading-relaxed text-dim text-pretty sm:text-[18px]"
          >
            SyncForge is a real-time collaboration engine built from first principles: a hand-written sequence CRDT that
            merges concurrent, offline and out-of-order edits — without a central arbiter deciding who wins.
          </motion.p>

          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } } }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <LinkButton href="/docs" variant="primary" size="lg" className="w-full sm:w-auto">
              Open workspace <ArrowRight className="size-4" />
            </LinkButton>
            <LinkButton href="/lab" size="lg" className="w-full sm:w-auto">
              <FlaskConical className="size-4 text-flare" /> Break it in the Lab
            </LinkButton>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.1, ease, delay: 0.45 }}
          className="mx-auto mt-16 max-w-5xl sm:mt-20"
        >
          <div className="mb-4 flex items-center justify-between gap-3 font-mono text-[11px] text-faint">
            <span>
              live · <span className="text-dim">@syncforge/crdt</span> running in your browser
            </span>
            <span className="hidden sm:inline">base “HELLO” → A types “ WORLD”, B types “Y ” after “HE”</span>
          </div>
          <MergeDemo />
        </motion.div>
      </div>
    </section>
  )
}
