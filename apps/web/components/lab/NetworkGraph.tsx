'use client'

import { motion } from 'motion/react'
import { useState } from 'react'
import { COLORS, REPLICAS, REPLICA_BY_ID, shortPrint, type NetworkSim, type Packet, type ReplicaId } from './sim'

interface Point {
  x: number
  y: number
}

const NODE_POS: Record<ReplicaId, Point> = {
  ada: { x: 200, y: 62 },
  grace: { x: 62, y: 292 },
  linus: { x: 338, y: 292 },
}

const NODE_R = 26
/** packets going opposite ways on one link ride slightly apart */
const LANE_OFFSET = 6

const LINKS: Array<[ReplicaId, ReplicaId]> = [
  ['ada', 'grace'],
  ['grace', 'linus'],
  ['linus', 'ada'],
]

/** Endpoints of a packet's path: from the edge of one node to the edge of the other, in its own lane. */
function lane(from: ReplicaId, to: ReplicaId) {
  const a = NODE_POS[from]
  const b = NODE_POS[to]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  // perpendicular, pointing to the right of travel
  const nx = -uy * LANE_OFFSET
  const ny = ux * LANE_OFFSET
  const start = { x: a.x + ux * NODE_R + nx, y: a.y + uy * NODE_R + ny }
  const end = { x: b.x - ux * NODE_R + nx, y: b.y - uy * NODE_R + ny }
  return { start, end, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } }
}

export function NetworkGraph({ sim, onToggleCut }: { sim: NetworkSim; onToggleCut: (id: ReplicaId) => void }) {
  const inFlight = sim.inFlight

  return (
    <div className="dot-grid relative overflow-hidden rounded-2xl border border-line bg-coal/70">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg border border-line bg-ink/70 px-2.5 py-1 font-mono text-[11px] text-dim">
        <span className={inFlight ? 'size-1.5 animate-pulse-soft rounded-full bg-flare' : 'size-1.5 rounded-full bg-faint'} />
        {inFlight} in flight
      </div>
      <div className="absolute top-3 right-3 z-10 font-mono text-[10.5px] text-faint">click a node to cut it</div>

      <svg viewBox="0 0 400 360" className="mx-auto block aspect-[10/9] w-full max-w-[520px]" role="img" aria-label="Network between the three replicas">
        {LINKS.map(([a, b]) => {
          const broken = sim.cut[a] || sim.cut[b]
          const pa = NODE_POS[a]
          const pb = NODE_POS[b]
          return (
            <g key={a + b}>
              <line
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={broken ? COLORS.danger : 'rgb(255 255 255 / 0.13)'}
                strokeOpacity={broken ? 0.45 : 1}
                strokeWidth={broken ? 1.2 : 1.5}
                strokeDasharray={broken ? '3 6' : undefined}
              />
              {broken && (
                <text
                  x={(pa.x + pb.x) / 2}
                  y={(pa.y + pb.y) / 2 + 4}
                  textAnchor="middle"
                  fontSize="13"
                  fill={COLORS.danger}
                  className="font-mono"
                >
                  ×
                </text>
              )}
            </g>
          )
        })}

        {sim.packets.map((p) => (
          <PacketDot key={p.id} packet={p} />
        ))}

        {REPLICAS.map((r) => {
          const pos = NODE_POS[r.id]
          const cut = sim.cut[r.id]
          const doc = sim.docs[r.id]
          const color = cut ? COLORS.danger : r.color
          const labelBelow = r.id !== 'ada'
          return (
            <g
              key={r.id}
              onClick={() => onToggleCut(r.id)}
              className="cursor-pointer"
              role="button"
              aria-label={`${cut ? 'Reconnect' : 'Cut'} ${r.name}`}
            >
              <circle cx={pos.x} cy={pos.y} r={NODE_R + 14} fill={color} opacity={0.08} />
              <circle cx={pos.x} cy={pos.y} r={NODE_R} fill="#111114" stroke={color} strokeWidth={1.6} strokeDasharray={cut ? '4 4' : undefined} />
              <text x={pos.x} y={pos.y + 5} textAnchor="middle" fontSize="15" fontWeight={600} fill={color}>
                {r.short}
              </text>
              <text
                x={pos.x}
                y={labelBelow ? pos.y + NODE_R + 18 : pos.y - NODE_R - 22}
                textAnchor="middle"
                fontSize="12"
                fontWeight={600}
                fill="#ecebe8"
              >
                {r.name}
                {cut ? ' · offline' : ''}
              </text>
              <text
                x={pos.x}
                y={labelBelow ? pos.y + NODE_R + 32 : pos.y - NODE_R - 9}
                textAnchor="middle"
                fontSize="10"
                fill="#5d5d66"
                className="font-mono"
              >
                #{shortPrint(doc.fingerprint())}
                {doc.pendingCount ? ` · ${doc.pendingCount} buf` : ''}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5 font-mono text-[10.5px] text-dim">
        <Legend label="op">
          <circle cx="6" cy="6" r="3.5" fill={REPLICA_BY_ID.ada.color} />
        </Legend>
        <Legend label="duplicate">
          <circle cx="6" cy="6" r="3" fill={COLORS.flare} />
          <circle cx="6" cy="6" r="5.2" fill="none" stroke={COLORS.flare} strokeWidth="1" />
        </Legend>
        <Legend label="anti-entropy">
          <circle cx="6" cy="6" r="5" fill="none" stroke={COLORS.tide} strokeWidth="1.3" strokeDasharray="2 1.6" />
          <circle cx="6" cy="6" r="2" fill={COLORS.tide} />
        </Legend>
        <Legend label="dropped">
          <text x="6" y="9.5" textAnchor="middle" fontSize="11" fill={COLORS.danger}>
            ×
          </text>
        </Legend>
      </div>
    </div>
  )
}

function Legend({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg viewBox="0 0 12 12" className="size-3">
        {children}
      </svg>
      {label}
    </span>
  )
}

function PacketDot({ packet }: { packet: Packet }) {
  const [dead, setDead] = useState(false)
  const { start, end, mid } = lane(packet.from, packet.to)
  const target = packet.dropped ? mid : end
  const travel = (packet.dropped ? packet.delay / 2 : packet.delay) / 1000

  const color =
    packet.kind === 'sync' ? COLORS.tide : packet.kind === 'dup' ? COLORS.flare : REPLICA_BY_ID[packet.from].color

  return (
    <motion.g
      initial={{ x: start.x, y: start.y }}
      animate={{ x: target.x, y: target.y }}
      transition={{ duration: travel, ease: 'linear' }}
      onAnimationComplete={() => {
        if (packet.dropped) setDead(true)
      }}
    >
      {dead ? (
        <motion.g initial={{ opacity: 1, scale: 0.8 }} animate={{ opacity: 0, scale: 1.7 }} transition={{ duration: 0.65, ease: 'easeOut' }}>
          <circle r={5} fill={COLORS.danger} opacity={0.35} />
          <text y={4} textAnchor="middle" fontSize="12" fontWeight={700} fill={COLORS.danger}>
            ×
          </text>
        </motion.g>
      ) : (
        <>
          <circle r={9} fill={color} opacity={0.14} />
          <circle r={packet.kind === 'sync' ? 2.4 : 3.4} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
          {packet.kind === 'dup' && <circle r={6} fill="none" stroke={color} strokeWidth={1} opacity={0.85} />}
          {packet.kind === 'sync' && (
            <circle r={5.6} fill="none" stroke={color} strokeWidth={1.3} strokeDasharray="2.2 1.8" />
          )}
        </>
      )}
    </motion.g>
  )
}
