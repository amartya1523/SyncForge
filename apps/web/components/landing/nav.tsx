'use client'

import { motion, useMotionValueEvent, useScroll } from 'motion/react'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Logo } from '@/components/ui'
import { cn } from '@/lib/cn'
import { GITHUB_URL, GithubMark, LinkButton } from './primitives'

export function Nav() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12))

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'sticky top-0 z-50 border-b transition-colors duration-300',
        scrolled ? 'glass border-line' : 'border-transparent bg-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/lab" className="hidden rounded-lg px-3 py-2 text-[13.5px] text-dim transition-colors hover:text-fg sm:inline-flex">
            Network Lab
          </Link>
          <a href="#how" className="hidden rounded-lg px-3 py-2 text-[13.5px] text-dim transition-colors hover:text-fg md:inline-flex">
            How it works
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] text-dim transition-colors hover:text-fg"
          >
            <GithubMark className="size-4" />
            <span className="hidden md:inline">GitHub</span>
          </a>
          <LinkButton href="/docs" variant="primary" size="sm" className="ml-1">
            Open workspace <ArrowRight className="size-3.5" />
          </LinkButton>
        </div>
      </nav>
    </motion.header>
  )
}
