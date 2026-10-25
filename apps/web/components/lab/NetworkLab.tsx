'use client'

import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Logo } from '@/components/ui'
import { ConvergenceBanner } from './ConvergenceBanner'
import { Controls } from './Controls'
import { EventLog } from './EventLog'
import { NetworkGraph } from './NetworkGraph'
import { ReplicaCard } from './ReplicaCard'
import { XRay } from './XRay'
import { NetworkSim, REPLICAS, shortPrint, type ReplicaId } from './sim'

export function NetworkLab() {
  const [sim] = useState(() => new NetworkSim())
  const version = useSyncExternalStore(sim.subscribe, sim.getVersion, sim.getVersion)

  useEffect(() => {
    sim.start()
    return () => sim.stop()
  }, [sim])

  const toggleCut = (id: ReplicaId) => sim.setCut(id, !sim.cut[id])
  const pending = REPLICAS.reduce((n, r) => n + sim.docs[r.id].pendingCount, 0)

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60"
        style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgb(255 106 61 / 0.13), transparent 70%)' }}
      />

      <div className="relative mx-auto flex max-w-[1240px] flex-col gap-5 px-4 pt-5 pb-16 sm:px-6">
        <nav className="flex items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-dim transition-colors hover:bg-white/[0.05] hover:text-fg"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Home</span>
            </Link>
            <Link
              href="/docs"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-white/[0.03] px-3 text-[13px] font-medium transition-colors hover:border-white/25 hover:bg-white/[0.06]"
            >
              Open workspace
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </nav>

        <header className="pt-4 pb-1">
          <div className="mb-2 font-mono text-[11px] tracking-[0.16em] text-faint uppercase">Runs entirely in your browser</div>
          <h1 className="font-display text-[44px] leading-[1.02] tracking-tight sm:text-[56px]">
            Network <span className="text-gradient italic">Lab</span>
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] text-dim">
            Three replicas, one hostile network. Add latency, drop and duplicate packets, cut cables, then watch the CRDT
            pull them back to the same state.
          </p>
        </header>

        <ConvergenceBanner
          converged={sim.converged}
          inFlight={sim.inFlight}
          pending={pending}
          hash={shortPrint(sim.docs.ada.fingerprint())}
        />

        <section className="grid gap-4 lg:grid-cols-3">
          {REPLICAS.map((r) => (
            <ReplicaCard
              key={r.id}
              replica={r}
              doc={sim.docs[r.id]}
              stats={sim.stats[r.id]}
              cut={sim.cut[r.id]}
              onToggleCut={() => toggleCut(r.id)}
              version={version}
            />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,320px)]">
          <Controls sim={sim} />
          <NetworkGraph sim={sim} onToggleCut={toggleCut} />
          <EventLog entries={sim.log} />
        </section>

        <XRay sim={sim} />
      </div>
    </div>
  )
}
