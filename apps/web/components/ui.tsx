'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <Link href="/" className={cn('group inline-flex items-center gap-2.5', className)}>
      <span className="relative grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-ember to-flare shadow-[0_0_24px_-4px_var(--color-ember)]">
        <svg viewBox="0 0 24 24" className="size-[18px] text-ink" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          {/* two strands merging into one */}
          <path d="M4 7c5 0 6 5 8 5s3-5 8-5" />
          <path d="M4 17c5 0 6-5 8-5s3 5 8 5" />
        </svg>
      </span>
      {withText && (
        <span className="text-[15px] font-semibold tracking-tight">
          Sync<span className="text-dim transition-colors group-hover:text-fg">Forge</span>
        </span>
      )}
    </Link>
  )
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-[15px]',
        variant === 'primary' &&
          'bg-gradient-to-b from-[#ff7d55] to-ember text-ink shadow-[0_8px_30px_-8px_var(--color-ember),inset_0_1px_0_rgb(255_255_255/0.35)] hover:brightness-110',
        variant === 'outline' && 'border border-line-strong bg-white/[0.03] text-fg hover:border-white/25 hover:bg-white/[0.06]',
        variant === 'ghost' && 'text-dim hover:bg-white/[0.06] hover:text-fg',
        variant === 'danger' && 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
        className,
      )}
      {...rest}
    />
  )
})

export function Avatar({ name, color, size = 28, ring }: { name: string; color: string; size?: number; ring?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      title={name}
      className={cn('grid shrink-0 place-items-center rounded-full font-semibold text-ink', ring && 'ring-2 ring-ink')}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </span>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line-strong bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-dim">{children}</kbd>
  )
}

/** Segmented tabs with a sliding pill (shared layout animation). */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  id,
  className,
}: {
  value: T
  onChange: (v: T) => void
  items: Array<{ value: T; label: React.ReactNode }>
  id: string
  className?: string
}) {
  return (
    <div className={cn('relative inline-flex rounded-xl border border-line bg-white/[0.02] p-1', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'relative z-10 inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors',
            value === it.value ? 'text-fg' : 'text-dim hover:text-fg',
          )}
        >
          {value === it.value && (
            <motion.span
              layoutId={id}
              className="absolute inset-0 -z-10 rounded-lg border border-line-strong bg-white/[0.07]"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80', className)} />
}
