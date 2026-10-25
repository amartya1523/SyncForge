'use client'

import { motion, type HTMLMotionProps } from 'motion/react'
import Link from 'next/link'
import { cn } from '@/lib/cn'

const ease = [0.22, 1, 0.36, 1] as const

/** Fades + lifts its children the first time they scroll into view. */
export function Reveal({
  delay = 0,
  y = 18,
  className,
  children,
  ...rest
}: HTMLMotionProps<'div'> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, ease, delay }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** Parent/child pair for staggered lists. */
export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}

export const rise = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-dim', className)}>
      <span className="h-px w-6 bg-gradient-to-r from-transparent to-ember" />
      {children}
    </div>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  className,
}: {
  eyebrow: string
  title: React.ReactNode
  lede?: React.ReactNode
  className?: string
}) {
  return (
    <Reveal className={cn('max-w-2xl', className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 font-display text-[40px] leading-[1.02] tracking-[-0.01em] text-balance sm:text-[56px]">{title}</h2>
      {lede && <p className="mt-5 text-[16px] leading-relaxed text-dim text-pretty sm:text-[17px]">{lede}</p>}
    </Reveal>
  )
}

/** Same look as <Button>, but a real link (no button-inside-anchor). */
export function LinkButton({
  href,
  variant = 'outline',
  size = 'md',
  className,
  children,
  external,
}: {
  href: string
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children: React.ReactNode
  external?: boolean
}) {
  const cls = cn(
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 active:scale-[0.97]',
    size === 'sm' && 'h-8 px-3 text-[13px]',
    size === 'md' && 'h-10 px-4 text-sm',
    size === 'lg' && 'h-12 px-6 text-[15px]',
    variant === 'primary' &&
      'bg-gradient-to-b from-[#ff7d55] to-ember text-ink shadow-[0_8px_30px_-8px_var(--color-ember),inset_0_1px_0_rgb(255_255_255/0.35)] hover:brightness-110',
    variant === 'outline' && 'border border-line-strong bg-white/[0.03] text-fg hover:border-white/25 hover:bg-white/[0.06]',
    variant === 'ghost' && 'text-dim hover:bg-white/[0.06] hover:text-fg',
    className,
  )
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  )
}

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

export const GITHUB_URL = 'https://github.com/amartya1523/SyncForge'
