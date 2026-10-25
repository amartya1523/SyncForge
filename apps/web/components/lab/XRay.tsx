'use client'

import { ScanEye } from 'lucide-react'
import { useState } from 'react'
import { Tabs } from '@/components/ui'
import { COLORS, REPLICAS, REPLICA_BY_ID, SEED_CLIENT, type NetworkSim, type ReplicaId } from './sim'

const MAX_TILES = 300

function authorOf(client: string) {
  if (client === SEED_CLIENT) return { short: 'S', color: COLORS.faint }
  const r = REPLICA_BY_ID[client as ReplicaId]
  return r ? { short: r.short, color: r.color } : { short: client.slice(0, 1).toUpperCase(), color: COLORS.faint }
}

function displayChar(ch: string) {
  if (ch === ' ') return '␣'
  if (ch === '\n') return '↵'
  if (ch === '\t') return '⇥'
  return ch
}

export function XRay({ sim }: { sim: NetworkSim }) {
  const [selected, setSelected] = useState<ReplicaId>('ada')
  const items = sim.docs[selected].inspect()
  const tombstones = items.reduce((n, it) => n + (it.deleted ? 1 : 0), 0)
  const shown = items.length > MAX_TILES ? items.slice(-MAX_TILES) : items

  return (
    <div className="rounded-2xl border border-line bg-coal/80 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <ScanEye className="size-4 text-ember" />
          <h2 className="text-[14px] font-semibold tracking-tight">X-ray</h2>
        </div>
        <Tabs
          id="lab-xray"
          value={selected}
          onChange={setSelected}
          items={REPLICAS.map((r) => ({
            value: r.id,
            label: (
              <>
                <span className="size-1.5 rounded-full" style={{ background: r.color }} />
                {r.name}
              </>
            ),
          }))}
        />
        <div className="ml-auto font-mono text-[11px] text-faint">
          {items.length} items · {tombstones} tombstones
          {items.length > MAX_TILES && ` · last ${MAX_TILES} shown`}
        </div>
      </div>
      <p className="mt-2 text-[12.5px] text-dim">
        Deleted characters stay as tombstones so concurrent inserts still know where they belong.
      </p>

      <div className="scroll-thin mt-3 flex max-h-[260px] flex-wrap gap-1 overflow-y-auto pr-1">
        {shown.map((it) => {
          const author = authorOf(it.id.client)
          return (
            <div
              key={it.id.client + ':' + it.id.clock}
              title={`${it.id.client}:${it.id.clock}${it.deleted ? ' (tombstone)' : ''}`}
              className="flex min-w-[34px] flex-col items-center rounded-md border px-1 pt-1 pb-0.5 font-mono"
              style={{
                borderColor: it.deleted ? 'rgb(255 255 255 / 0.06)' : author.color + '55',
                background: it.deleted ? 'transparent' : author.color + '14',
                opacity: it.deleted ? 0.4 : 1,
              }}
            >
              <span
                className="text-[13px] leading-none"
                style={{ color: it.deleted ? COLORS.faint : '#ecebe8', textDecoration: it.deleted ? 'line-through' : undefined }}
              >
                {displayChar(it.char)}
              </span>
              <span className="mt-1 text-[9px] leading-none whitespace-nowrap" style={{ color: author.color }}>
                {author.short}·{it.id.clock}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
