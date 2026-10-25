'use client'

import confetti from 'canvas-confetti'
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

/** Card that tilts toward the cursor in 3D, with a moving glare. */
export function Tilt({ children, className, max = 10, glare = true }: { children: React.ReactNode; className?: string; max?: number; glare?: boolean }) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0.5)
  const y = useMotionValue(0.5)
  const rx = useSpring(useTransform(y, [0, 1], [max, -max]), { stiffness: 220, damping: 18 })
  const ry = useSpring(useTransform(x, [0, 1], [-max, max]), { stiffness: 220, damping: 18 })
  const gx = useTransform(x, (v) => `${v * 100}%`)
  const gy = useTransform(y, (v) => `${v * 100}%`)
  const glareBg = useMotionTemplate`radial-gradient(420px circle at ${gx} ${gy}, rgb(255 255 255 / 0.13), transparent 45%)`

  return (
    <div style={{ perspective: 900 }} className={className}>
      <motion.div
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          x.set((e.clientX - r.left) / r.width)
          y.set((e.clientY - r.top) / r.height)
        }}
        onPointerLeave={() => {
          x.set(0.5)
          y.set(0.5)
        }}
        style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        className="relative h-full"
      >
        {children}
        {glare && <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glareBg }} />}
      </motion.div>
    </div>
  )
}

/** Pulls its child toward the cursor when it gets close. */
export function Magnetic({ children, strength = 0.35, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const x = useSpring(0, { stiffness: 300, damping: 18, mass: 0.4 })
  const y = useSpring(0, { stiffness: 300, damping: 18, mass: 0.4 })
  return (
    <motion.div
      className={cn('inline-block', className)}
      style={{ x, y }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - (r.left + r.width / 2)) * strength)
        y.set((e.clientY - (r.top + r.height / 2)) * strength)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}

/** Soft light that follows the cursor across the whole page. */
export function Spotlight({ color = 'rgb(255 106 61 / 0.09)', size = 640 }: { color?: string; size?: number }) {
  const x = useSpring(-1000, { stiffness: 120, damping: 24 })
  const y = useSpring(-1000, { stiffness: 120, damping: 24 })
  const bg = useMotionTemplate`radial-gradient(${size}px circle at ${x}px ${y}px, ${color}, transparent 60%)`
  useEffect(() => {
    const move = (e: PointerEvent) => {
      x.set(e.clientX)
      y.set(e.clientY)
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [x, y])
  return <motion.div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{ background: bg }} />
}

/** Slow drifting colour blobs, blurred into an aurora. */
export function Aurora({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const blobs = [
    { c: '#ff6a3d', x: ['-10%', '15%', '-5%'], y: ['-20%', '5%', '-10%'], s: 620, d: 22 },
    { c: '#a78bfa', x: ['60%', '45%', '70%'], y: ['-10%', '20%', '0%'], s: 520, d: 26 },
    { c: '#5eead4', x: ['30%', '55%', '25%'], y: ['40%', '25%', '50%'], s: 480, d: 30 },
  ]
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-[110px]"
          style={{ width: b.s, height: b.s, background: b.c, opacity: 0.13 * intensity }}
          animate={{ left: b.x, top: b.y, scale: [1, 1.15, 0.95, 1] }}
          transition={{ duration: b.d, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

/** Headline whose letters flip up out of the page, one after another. */
export function SplitText({
  text,
  className,
  letterClassName,
  delay = 0,
  stagger = 0.035,
}: {
  text: string
  className?: string
  /** applied to every letter; gradients via background-clip must live here, not on the wrapper */
  letterClassName?: string
  delay?: number
  stagger?: number
}) {
  return (
    <span className={cn('inline-block', className)} style={{ perspective: 600 }} aria-label={text}>
      {text.split('').map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={cn('inline-block will-change-transform', letterClassName)}
          style={{ transformOrigin: '50% 100%' }}
          initial={{ opacity: 0, rotateX: -95, y: 28, filter: 'blur(6px)' }}
          animate={{ opacity: 1, rotateX: 0, y: 0, filter: 'blur(0px)' }}
          transition={{ type: 'spring', stiffness: 170, damping: 16, delay: delay + i * stagger }}
          whileHover={{ y: -8, rotate: i % 2 ? 4 : -4, transition: { type: 'spring', stiffness: 500, damping: 10 } }}
        >
          {ch === ' ' ? ' ' : ch}
        </motion.span>
      ))}
    </span>
  )
}

const BRAND = ['#ff6a3d', '#ffb547', '#5eead4', '#a78bfa', '#f472b6', '#ecebe8']

/** A celebratory burst from an element (or the centre of the screen). */
export function burst(from?: Element | null, opts: { count?: number; spread?: number } = {}) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const r = from?.getBoundingClientRect()
  const origin = r
    ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight }
    : { x: 0.5, y: 0.45 }
  void confetti({ particleCount: opts.count ?? 70, spread: opts.spread ?? 75, startVelocity: 32, origin, colors: BRAND, scalar: 0.9, ticks: 160, zIndex: 200, disableForReducedMotion: true })
}

/** Number that counts up/down smoothly when it changes. */
export function Ticker({ value, className }: { value: number; className?: string }) {
  const v = useSpring(value, { stiffness: 140, damping: 20 })
  const text = useTransform(v, (n) => Math.round(n).toLocaleString())
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      v.jump(value)
    } else v.set(value)
  }, [value, v])
  return <motion.span className={className}>{text}</motion.span>
}
