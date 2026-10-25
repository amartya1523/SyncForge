'use client'

import { ArrowRight, FlaskConical } from 'lucide-react'
import { motion, useScroll, useTransform } from 'motion/react'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { Aurora, Magnetic, SplitText } from '@/components/fx/motion'
import { type Mood, Sparky } from '@/components/fx/sparky'
import { MergeDemo } from './merge-demo'
import { LinkButton } from './primitives'

// WebGL never renders on the server
const ForgeScene = dynamic(() => import('@/components/fx/forge-scene'), { ssr: false })

const ease = [0.22, 1, 0.36, 1] as const

const TIPS: Array<{ mood: Mood; say: string }> = [
  { mood: 'happy', say: 'Hi! I keep everyone’s edits in sync 👋' },
  { mood: 'curious', say: 'Open the workspace in two windows…' },
  { mood: 'working', say: 'Every orbiting page is a replica.' },
  { mood: 'party', say: 'Zero conflicts. Every time. ✨' },
]

export function Hero() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, 160])
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 0.85])
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const [tip, setTip] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 4200)
    return () => clearInterval(t)
  }, [])

  return (
    <section ref={ref} className="relative overflow-hidden">
      <Aurora intensity={1.1} />
      <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-4 px-4 pb-10 pt-10 sm:px-6 sm:pt-16 lg:min-h-[calc(100dvh-64px)] lg:grid-cols-[1.05fr_1fr] lg:pb-16">
        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } } }} className="relative z-10 text-center lg:text-left">
          <motion.a
            href="#how"
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }}
            className="group inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-1 pl-1 pr-3 text-[12.5px] text-dim backdrop-blur transition-colors hover:border-line-strong hover:text-fg"
          >
            <span className="relative overflow-hidden rounded-full bg-ember/15 px-2 py-0.5 font-mono text-[10.5px] text-ember">
              CRDT
              <motion.span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                animate={{ x: ['-120%', '120%'] }}
                transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.5 }}
              />
            </span>
            Written from scratch — no Yjs, no Automerge
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </motion.a>

          <h1 className="mt-7 font-display text-[56px] leading-[0.92] tracking-[-0.02em] sm:text-[88px] xl:text-[108px]">
            <SplitText text="Many hands." delay={0.25} />
            <br />
            <em className="relative inline-block pr-3">
              <SplitText text="One" delay={0.75} letterClassName="text-gradient pr-[0.04em]" />
              <motion.svg viewBox="0 0 200 20" className="absolute -bottom-1 left-0 w-full overflow-visible" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
                <motion.path
                  d="M3 14 C 50 4, 120 4, 197 12"
                  fill="none"
                  stroke="url(#underline)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 1.25, duration: 0.9, ease }}
                />
                <defs>
                  <linearGradient id="underline">
                    <stop offset="0" stopColor="#ff6a3d" />
                    <stop offset="1" stopColor="#ffb547" />
                  </linearGradient>
                </defs>
              </motion.svg>
            </em>{' '}
            <SplitText text="document." delay={0.95} />
          </h1>

          <motion.p
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease, delay: 1 } } }}
            className="mx-auto mt-7 max-w-xl text-[16px] leading-relaxed text-dim text-pretty sm:text-[18px] lg:mx-0"
          >
            A real-time collaboration engine built from first principles: a hand-written sequence CRDT that merges concurrent, offline and out-of-order edits —{' '}
            <span className="text-fg">without a central arbiter deciding who wins.</span>
          </motion.p>

          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease, delay: 1.15 } } }}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
          >
            <Magnetic>
              <LinkButton href="/docs" variant="primary" size="lg" className="group w-full sm:w-auto">
                Open workspace <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </LinkButton>
            </Magnetic>
            <Magnetic>
              <LinkButton href="/lab" size="lg" className="group w-full sm:w-auto">
                <FlaskConical className="size-4 text-flare transition-transform group-hover:-rotate-12 group-hover:scale-110" /> Break it in the Lab
              </LinkButton>
            </Magnetic>
          </motion.div>
        </motion.div>

        {/* the forge */}
        <motion.div
          style={{ y: sceneY, scale: sceneScale, opacity: fade }}
          className="relative -mx-4 h-[420px] sm:h-[520px] lg:mx-0 lg:h-[640px]"
        >
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.6, ease, delay: 0.3 }} className="absolute inset-0">
            <ForgeScene className="absolute inset-0 [mask-image:radial-gradient(closest-side,black_60%,transparent)]" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 40, rotate: -20 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 12, delay: 1.6 }}
            className="absolute bottom-6 left-6 sm:bottom-10 sm:left-10"
          >
            <Sparky mood={TIPS[tip].mood} say={TIPS[tip].say} size={92} onClick={() => setTip((i) => (i + 1) % TIPS.length)} />
          </motion.div>
          <div className="pointer-events-none absolute right-4 top-6 hidden flex-col items-end gap-1 font-mono text-[10.5px] text-faint sm:flex">
            <span>7 replicas · 1 converged state</span>
            <span className="text-dim">move your cursor ↺</span>
          </div>
        </motion.div>
      </div>

      <div className="relative mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:pb-32">
        <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 1, ease }}>
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
