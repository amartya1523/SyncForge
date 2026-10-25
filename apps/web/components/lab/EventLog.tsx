'use client'

import { Activity } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatAt, type LogEntry, type LogTone } from './sim'

const TONE: Record<LogTone, string> = {
  op: 'text-fg/85',
  dup: 'text-flare',
  sync: 'text-tide',
  drop: 'text-danger',
  info: 'text-faint',
}

export function EventLog({ entries }: { entries: LogEntry[] }) {
  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-line bg-coal/80">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Activity className="size-4 text-ember" />
        <h2 className="text-[14px] font-semibold tracking-tight">Event log</h2>
        <span className="ml-auto font-mono text-[10.5px] text-faint">last {entries.length}</span>
      </div>
      <ol className="scroll-thin max-h-[420px] min-h-[220px] flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-[1.7]">
        {entries
          .slice()
          .reverse()
          .map((e) => (
            <li key={e.id} className="flex gap-2.5">
              <span className="shrink-0 text-faint/70 tabular-nums">{formatAt(e.at)}</span>
              <span className={cn('min-w-0 break-words whitespace-pre-wrap', TONE[e.tone])}>{e.text}</span>
            </li>
          ))}
      </ol>
    </div>
  )
}
