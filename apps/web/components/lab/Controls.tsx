'use client'

import { Bot, RefreshCw, RotateCcw, Skull, Wifi, Zap } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { PRESETS, type NetConfig, type NetworkSim } from './sim'

const PRESET_BUTTONS = [
  { key: 'calm', label: 'Calm', icon: Zap },
  { key: 'badWifi', label: 'Bad wifi', icon: Wifi },
  { key: 'apocalypse', label: 'Apocalypse', icon: Skull },
] as const

export function Controls({ sim }: { sim: NetworkSim }) {
  const c = sim.config
  const activePreset = PRESET_BUTTONS.find((p) => sameConfig(PRESETS[p.key], c))?.key

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-coal/80 p-4">
      <div>
        <SectionLabel>Presets</SectionLabel>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESET_BUTTONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => sim.setConfig(PRESETS[key])}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium transition-colors',
                activePreset === key
                  ? key === 'apocalypse'
                    ? 'border-danger/40 bg-danger/15 text-danger'
                    : 'border-ember/40 bg-ember/15 text-ember'
                  : 'border-line bg-white/[0.02] text-dim hover:border-line-strong hover:text-fg',
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionLabel>Network</SectionLabel>
        <Slider label="Latency" value={c.latency} max={3000} step={50} unit="ms" onChange={(v) => sim.setConfig({ latency: v })} />
        <Slider label="Jitter" value={c.jitter} max={100} unit="%" onChange={(v) => sim.setConfig({ jitter: v })} />
        <Slider label="Packet loss" value={c.loss} max={60} unit="%" danger onChange={(v) => sim.setConfig({ loss: v })} />
        <Slider label="Duplication" value={c.dup} max={60} unit="%" onChange={(v) => sim.setConfig({ dup: v })} />
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionLabel>Behaviour</SectionLabel>
        <Toggle
          label="Auto anti-entropy"
          hint="every 3s each pair swaps what the other is missing"
          checked={sim.antiEntropy}
          color="var(--color-tide)"
          onChange={(v) => sim.setAntiEntropy(v)}
        />
        <Toggle
          label="Chaos bots"
          hint="all three replicas type and delete on their own"
          icon={<Bot className="size-3.5" />}
          checked={sim.chaos}
          color="var(--color-flare)"
          onChange={(v) => sim.setChaos(v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={() => sim.syncNow()}>
          <RefreshCw className="size-3.5" />
          Sync now
        </Button>
        <Button size="sm" variant="ghost" onClick={() => sim.reset()} className="border border-line">
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>
    </div>
  )
}

function sameConfig(a: NetConfig, b: NetConfig) {
  return a.latency === b.latency && a.jitter === b.jitter && a.loss === b.loss && a.dup === b.dup
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 font-mono text-[10.5px] tracking-[0.14em] text-faint uppercase">{children}</div>
}

function Slider({
  label,
  value,
  max,
  step = 1,
  unit,
  danger,
  onChange,
}: {
  label: string
  value: number
  max: number
  step?: number
  unit: string
  danger?: boolean
  onChange: (v: number) => void
}) {
  const pct = (value / max) * 100
  const hot = danger && value > 0
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
        <span className="text-dim">{label}</span>
        <span className={cn('font-mono text-[12px] tabular-nums', hot ? 'text-danger' : 'text-fg')}>
          {value}
          <span className="text-faint">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn('h-1.5 w-full cursor-pointer appearance-none rounded-full', hot ? 'accent-danger' : 'accent-ember')}
        style={{
          background: `linear-gradient(90deg, ${hot ? 'var(--color-danger)' : 'var(--color-ember)'} ${pct}%, rgb(255 255 255 / 0.08) ${pct}%)`,
        }}
      />
    </label>
  )
}

function Toggle({
  label,
  hint,
  checked,
  color,
  icon,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  color: string
  icon?: React.ReactNode
  onChange: (v: boolean) => void
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-line-strong"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium">
          {icon}
          {label}
        </div>
        <div className="truncate text-[11.5px] text-faint">{hint}</div>
      </div>
      <span
        className="relative h-5 w-9 shrink-0 rounded-full border transition-colors"
        style={{
          background: checked ? color : 'rgb(255 255 255 / 0.06)',
          borderColor: checked ? color : 'var(--color-line-strong)',
          boxShadow: checked ? `0 0 16px -4px ${color}` : undefined,
        }}
      >
        <span
          className={cn(
            'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full transition-all',
            checked ? 'left-[18px] bg-ink' : 'left-[2px] bg-dim',
          )}
        />
      </span>
    </button>
  )
}
