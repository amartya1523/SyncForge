'use client'

import { ArrowRight, FlaskConical } from 'lucide-react'
import { Logo } from '@/components/ui'
import { GITHUB_URL, GithubMark, LinkButton, Reveal } from './primitives'

export function FinalCta() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32">
      <Reveal className="relative overflow-hidden rounded-[28px] border border-line-strong bg-coal px-6 py-16 text-center sm:px-12 sm:py-24">
        <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(60%_70%_at_50%_100%,black,transparent)]" />
        <div className="pointer-events-none absolute bottom-[-220px] left-1/2 h-[420px] w-[760px] max-w-[180%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_106_61/0.35),rgb(255_181_71/0.08)_60%,transparent)] blur-2xl" />
        <div className="relative">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Bring four friends</p>
          <h2 className="mx-auto mt-5 max-w-3xl font-display text-[44px] leading-[1] tracking-[-0.01em] text-balance sm:text-[72px]">
            Open a doc. Pull the plug.
            <br />
            <em className="text-gradient pr-2">Watch it heal.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-[15.5px] leading-relaxed text-dim">
            Share a link, go offline mid-sentence, restore last week’s draft — and see every replica land on the same text.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton href="/docs" variant="primary" size="lg" className="w-full sm:w-auto">
              Open workspace <ArrowRight className="size-4" />
            </LinkButton>
            <LinkButton href="/lab" size="lg" className="w-full sm:w-auto">
              <FlaskConical className="size-4 text-flare" /> Break it in the Lab
            </LinkButton>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <Logo />
          <p className="text-[13px] text-dim">
            Built by <span className="text-fg">Amartya Vikram Singh</span>
          </p>
        </div>
        <div className="flex items-center gap-5 text-[13px] text-dim">
          <a href="/lab" className="transition-colors hover:text-fg">
            Network Lab
          </a>
          <a href="#how" className="transition-colors hover:text-fg">
            How it works
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-fg">
            <GithubMark className="size-4" /> GitHub
          </a>
        </div>
      </div>
    </footer>
  )
}
