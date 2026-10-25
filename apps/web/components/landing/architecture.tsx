'use client'

import { motion } from 'motion/react'
import { rise, SectionHeading, stagger } from './primitives'

interface Box {
  id: string
  x: number
  y: number
  w: number
  h: number
  title: string
  sub: string
  color: string
}

interface Edge {
  from: string
  to: string
  color: string
  /** 'both' sends dots each way, 'down' only from → to */
  flow: 'both' | 'down'
  delay: number
}

interface Layout {
  key: string
  width: number
  height: number
  vertical: boolean
  boxes: Box[]
}

const EMBER = '#ff6a3d'
const TIDE = '#5eead4'
const FLARE = '#ffb547'
const VIOLET = '#a78bfa'
const RED = '#ff5c6c'

const EDGES: Edge[] = [
  { from: 'c1', to: 'na', color: EMBER, flow: 'both', delay: 0 },
  { from: 'c2', to: 'na', color: TIDE, flow: 'both', delay: 0.7 },
  { from: 'c3', to: 'nb', color: VIOLET, flow: 'both', delay: 0.35 },
  { from: 'na', to: 'redis', color: RED, flow: 'both', delay: 0.2 },
  { from: 'nb', to: 'redis', color: RED, flow: 'both', delay: 0.9 },
  { from: 'na', to: 'pg', color: FLARE, flow: 'down', delay: 0.5 },
  { from: 'nb', to: 'pg', color: FLARE, flow: 'down', delay: 1.1 },
]

const clients = [
  { id: 'c1', title: 'Asha · browser', color: EMBER },
  { id: 'c2', title: 'Bilal · browser', color: TIDE },
  { id: 'c3', title: 'Chen · browser', color: VIOLET },
]

const WIDE: Layout = {
  key: 'wide',
  width: 960,
  height: 440,
  vertical: false,
  boxes: [
    ...clients.map((c, i) => ({ ...c, x: 10, y: 40 + i * 136, w: 200, h: 84, sub: 'Next.js + IndexedDB' })),
    { id: 'na', x: 385, y: 92, w: 190, h: 92, title: 'node-a', sub: 'WebSocket gateway', color: '#ecebe8' },
    { id: 'nb', x: 385, y: 256, w: 190, h: 92, title: 'node-b', sub: 'WebSocket gateway', color: '#ecebe8' },
    { id: 'redis', x: 750, y: 92, w: 200, h: 92, title: 'Redis', sub: 'pub/sub fan-out', color: RED },
    { id: 'pg', x: 750, y: 256, w: 200, h: 92, title: 'Postgres', sub: 'op log + snapshots', color: FLARE },
  ],
}

const NARROW: Layout = {
  key: 'narrow',
  width: 360,
  height: 560,
  vertical: true,
  boxes: [
    ...clients.map((c, i) => ({ ...c, title: c.title.split(' ·')[0], x: 4 + i * 120, y: 10, w: 112, h: 74, sub: 'IndexedDB' })),
    { id: 'na', x: 20, y: 230, w: 145, h: 82, title: 'node-a', sub: 'WS gateway', color: '#ecebe8' },
    { id: 'nb', x: 195, y: 230, w: 145, h: 82, title: 'node-b', sub: 'WS gateway', color: '#ecebe8' },
    { id: 'redis', x: 20, y: 464, w: 145, h: 82, title: 'Redis', sub: 'pub/sub', color: RED },
    { id: 'pg', x: 195, y: 464, w: 145, h: 82, title: 'Postgres', sub: 'op log', color: FLARE },
  ],
}

function edgePath(layout: Layout, e: Edge) {
  const a = layout.boxes.find((b) => b.id === e.from)!
  const b = layout.boxes.find((b) => b.id === e.to)!
  if (layout.vertical) {
    const x1 = a.x + a.w / 2
    const y1 = a.y + a.h
    const x2 = b.x + b.w / 2
    const y2 = b.y
    const my = (y1 + y2) / 2
    return `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
  }
  const x1 = a.x + a.w
  const y1 = a.y + a.h / 2
  const x2 = b.x
  const y2 = b.y + b.h / 2
  const mx = (x1 + x2) / 2
  return `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

function Diagram({ layout, className }: { layout: Layout; className?: string }) {
  const v = layout.vertical
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className={className} role="img" aria-label="SyncForge architecture">
      <defs>
        <filter id={`glow-${layout.key}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {EDGES.map((e, i) => {
        const d = edgePath(layout, e)
        return (
          <g key={`${e.from}-${e.to}`}>
            <motion.path
              d={d}
              fill="none"
              stroke="rgb(255 255 255 / 0.13)"
              strokeWidth={1.25}
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.1, delay: 0.3 + i * 0.08, ease: 'easeInOut' }}
            />
            <Pulse d={d} color={e.color} begin={e.delay} dur={2.4} filter={`glow-${layout.key}`} />
            {e.flow === 'both' && <Pulse d={d} color={e.color} begin={e.delay + 1.2} dur={2.4} reverse filter={`glow-${layout.key}`} />}
          </g>
        )
      })}

      {layout.boxes.map((b, i) => (
        <motion.g
          key={b.id}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={14} fill="#111114" stroke="rgb(255 255 255 / 0.14)" />
          <rect x={b.x + 14} y={b.y + 14} width={6} height={6} rx={3} fill={b.color} />
          <text x={b.x + 28} y={b.y + (v ? 22 : 23)} fontSize={v ? 12.5 : 14} fontWeight={600} fill="#ecebe8" fontFamily="var(--font-sans)">
            {b.title}
          </text>
          <text x={b.x + 14} y={b.y + b.h - (v ? 16 : 20)} fontSize={v ? 10.5 : 12} fill="#9a9aa3" fontFamily="var(--font-mono)">
            {b.sub}
          </text>
        </motion.g>
      ))}

      {/* tier labels */}
      {(v
        ? [
            { x: 4, y: 112, t: 'clients' },
            { x: 20, y: 340, t: 'gateways' },
            { x: 20, y: 452, t: 'shared state' },
          ]
        : [
            { x: 10, y: 24, t: 'CLIENTS' },
            { x: 385, y: 76, t: 'GATEWAYS' },
            { x: 750, y: 76, t: 'SHARED STATE' },
          ]
      ).map((l) => (
        <text key={l.t} x={l.x} y={l.y} fontSize={10} letterSpacing={1.5} fill="#5d5d66" fontFamily="var(--font-mono)">
          {l.t.toUpperCase()}
        </text>
      ))}
    </svg>
  )
}

function Pulse({
  d,
  color,
  begin,
  dur,
  reverse,
  filter,
}: {
  d: string
  color: string
  begin: number
  dur: number
  reverse?: boolean
  filter: string
}) {
  const motionProps = {
    dur: `${dur}s`,
    begin: `${begin}s`,
    repeatCount: 'indefinite',
    path: d,
    keyPoints: reverse ? '1;0' : '0;1',
    keyTimes: '0;1',
    calcMode: 'linear' as const,
  }
  return (
    <g>
      <circle r={5} fill={color} opacity={0.55} filter={`url(#${filter})`}>
        <animateMotion {...motionProps} />
      </circle>
      <circle r={2.4} fill={color}>
        <animateMotion {...motionProps} />
      </circle>
    </g>
  )
}

const STEPS = [
  {
    n: '01',
    title: 'Send your state vector',
    body: 'On connect the client says hello with a tiny map of “the last op I have from each author”.',
    code: "→ { t: 'hello', sv: { a: 182, c: 40 } }",
  },
  {
    n: '02',
    title: 'Receive what you’re missing',
    body: 'The gateway diffs its replica against that vector and replies with exactly the missing ops — nothing more.',
    code: "← { t: 'welcome', ops: doc.diff(sv), sv }",
  },
  {
    n: '03',
    title: 'Upload yours',
    body: 'The client does the same in reverse, flushing whatever it wrote offline. From then on, ops stream live.',
    code: "→ { t: 'ops', ops: local.diff(server.sv) }",
  },
]

export function Architecture() {
  return (
    <section id="how" className="relative scroll-mt-20 border-t border-line">
      <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_70%,transparent)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <SectionHeading
          eyebrow="How it works"
          title={
            <>
              Servers relay. <em className="text-gradient pr-1">Replicas</em> decide.
            </>
          }
          lede="Every gateway holds a durable replica, not a lock. Ops published on one node reach the others through Redis; Postgres keeps the append-only log so any node can cold-start any document."
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-14 rounded-3xl border border-line bg-coal/60 p-4 sm:p-8"
        >
          <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(50%_60%_at_40%_50%,rgb(255_106_61/0.07),transparent)]" />
          <Diagram layout={WIDE} className="relative hidden h-auto w-full md:block" />
          <Diagram layout={NARROW} className="relative mx-auto h-auto w-full max-w-[360px] md:hidden" />
        </motion.div>

        <motion.ol
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-10 grid gap-4 md:grid-cols-3"
        >
          {STEPS.map((s) => (
            <motion.li key={s.n} variants={rise} className="relative min-w-0 rounded-2xl border border-line bg-coal/50 p-6">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-[34px] italic leading-none text-gradient">{s.n}</span>
                <h3 className="text-[15px] font-medium">{s.title}</h3>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-dim">{s.body}</p>
              <pre className="scroll-thin mt-4 overflow-x-auto rounded-lg border border-line bg-ink/70 px-3 py-2 font-mono text-[11px] text-flare/90">
                {s.code}
              </pre>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  )
}
