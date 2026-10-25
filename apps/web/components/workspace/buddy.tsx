'use client'

import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { burst } from '@/components/fx/motion'
import { type Mood, Sparky } from '@/components/fx/sparky'
import type { Collab } from '@/lib/use-collab'

const TIPS = [
  'Try “Go offline”, edit, then come back.',
  'Select text to leave a comment.',
  'Toggle Authors to see who wrote what.',
  'Every version can be compared with now.',
  '⌘Z only undoes your own edits.',
]

/**
 * Sparky as a sync status indicator. Its mood is the connection state; it also
 * narrates what just happened (someone joined, came back online, saved a version).
 */
export function SyncBuddy({ collab }: { collab: Collab }) {
  const { status, pending, peers, versions, provider } = collab
  const [say, setSay] = useState<string | null>(null)
  const [party, setParty] = useState(false)
  const [tip, setTip] = useState(0)
  const anchor = useRef<HTMLDivElement>(null)
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const speak = (text: string, celebrate = false) => {
    setSay(text)
    if (sayTimer.current) clearTimeout(sayTimer.current)
    sayTimer.current = setTimeout(() => setSay(null), 3800)
    if (celebrate) {
      setParty(true)
      setTimeout(() => setParty(false), 2600)
    }
  }

  // people joining
  const known = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = new Set(peers.filter((p) => p.conn !== provider?.conn).map((p) => p.user.id))
    if (known.current) {
      for (const p of peers) {
        if (ids.has(p.user.id) && !known.current.has(p.user.id) && p.user.id !== provider?.user?.id) {
          speak(`${p.user.name.split(' ')[0]} joined 👋`)
          break
        }
      }
    }
    known.current = ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers.map((p) => p.user.id).join()])

  // connection changes
  const lastStatus = useRef(status)
  const beenOnline = useRef(false)
  useEffect(() => {
    const prev = lastStatus.current
    lastStatus.current = status
    if (prev === status) return
    if (status === 'offline') speak('Offline. I’m keeping your edits safe locally 💤')
    if (status === 'connecting' && prev === 'online') speak('Connection dropped — retrying…')
    // the first connect isn't news; coming back after a drop is
    if (status === 'online' && beenOnline.current) speak('Back online — everything merged!', true)
    if (status === 'online') beenOnline.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // versions saved / restored
  // baseline is taken once the welcome arrived, so loading history isn't a "save"
  const versionCount = useRef<number | null>(null)
  useEffect(() => {
    if (status !== 'online' && versionCount.current === null) return
    if (versionCount.current !== null && versions.length > versionCount.current) {
      const v = versions[0]
      if (!v.auto) {
        speak(v.name.startsWith('Restored') ? 'Restored — and nobody’s work was lost.' : `Saved “${v.name}” ✨`, true)
        burst(anchor.current)
      }
    }
    versionCount.current = versions.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions.length, status])

  const mood: Mood = party
    ? 'party'
    : status === 'denied'
      ? 'sad'
      : status === 'offline'
        ? 'sleepy'
        : status === 'connecting'
          ? 'worried'
          : pending > 0
            ? 'working'
            : 'happy'

  return (
    <motion.div
      ref={anchor}
      initial={{ opacity: 0, y: 30, scale: 0.6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.6 }}
      className="pointer-events-auto absolute bottom-6 left-8 z-20 hidden sm:block"
    >
      <Sparky
        mood={mood}
        size={58}
        say={say}
        onClick={() => {
          speak(TIPS[tip])
          setTip((t) => (t + 1) % TIPS.length)
        }}
      />
    </motion.div>
  )
}
