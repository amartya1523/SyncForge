'use client'

import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Button, Spinner } from '@/components/ui'
import { type Session, signIn } from '@/lib/session'

export function SignInCard({ onDone, current }: { onDone: (s: Session) => void; current?: Session | null }) {
  const [name, setName] = useState(current?.user.name ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <motion.form
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        setBusy(true)
        setErr(null)
        try {
          onDone(await signIn(name.trim(), current))
        } catch (error) {
          setErr((error as Error).message)
        } finally {
          setBusy(false)
        }
      }}
      className="w-full max-w-md rounded-3xl border border-line bg-coal/80 p-8 shadow-[0_40px_120px_-40px_rgb(255_106_61/0.35)]"
    >
      <h1 className="font-display text-4xl leading-tight">
        Who&apos;s <em className="text-gradient">joining</em>?
      </h1>
      <p className="mt-2 text-sm text-dim">Your name shows up on your cursor, comments and in version history.</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Ada Lovelace"
        maxLength={40}
        className="mt-6 h-12 w-full rounded-xl border border-line-strong bg-ink/60 px-4 text-[15px] outline-none transition focus:border-ember/60 focus:ring-4 focus:ring-ember/10"
      />
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      <Button variant="primary" size="lg" className="mt-5 w-full" disabled={busy || !name.trim()}>
        {busy ? <Spinner className="border-ink/30 border-t-ink" /> : <>Continue <ArrowRight className="size-4" /></>}
      </Button>
    </motion.form>
  )
}
