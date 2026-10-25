'use client'

import { AnimatePresence, motion, useAnimationControls, useMotionValue, useSpring } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * Sparky — a little ember from the forge. Purely decorative, but it reflects real
 * state: in the workspace its mood is driven by the sync status, in the Lab by
 * whether the replicas have converged.
 */
export type Mood = 'happy' | 'working' | 'worried' | 'sleepy' | 'party' | 'curious' | 'sad'

interface Props {
  mood?: Mood
  size?: number
  say?: React.ReactNode
  className?: string
  /** speech bubble side */
  bubble?: 'left' | 'right' | 'top'
  onClick?: () => void
}

const MOUTHS: Record<Mood, string> = {
  happy: 'M49 101 Q60 113 71 101',
  working: 'M55 104 Q60 108 65 104 Q60 100 55 104',
  worried: 'M49 107 Q54.5 101 60 107 Q65.5 113 71 107',
  sleepy: 'M53 106 Q60 108 67 106',
  party: 'M47 99 Q60 120 73 99 Q60 103 47 99',
  curious: 'M56 104 Q60 109 64 104 Q60 103 56 104',
  sad: 'M50 109 Q60 100 70 109',
}

export function Sparky({ mood = 'happy', size = 120, say, className, bubble = 'right', onClick }: Props) {
  const id = useId().replace(/:/g, '')
  const root = useRef<SVGSVGElement>(null)
  const px = useSpring(useMotionValue(0), { stiffness: 260, damping: 22 })
  const py = useSpring(useMotionValue(0), { stiffness: 260, damping: 22 })
  const body = useAnimationControls()
  const [blink, setBlink] = useState(false)

  // pupils follow the cursor anywhere on the page
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const r = root.current?.getBoundingClientRect()
      if (!r) return
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height * 0.6)
      const d = Math.hypot(dx, dy) || 1
      const reach = Math.min(1, d / 260)
      px.set((dx / d) * 4.2 * reach)
      py.set((dy / d) * 3.6 * reach)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [px, py])

  // blink at irregular intervals, like a living thing
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true)
        setTimeout(() => setBlink(false), 130)
        loop()
      }, 1800 + Math.random() * 3200)
    }
    loop()
    return () => clearTimeout(t)
  }, [])

  // a happy hop whenever the mood changes
  useEffect(() => {
    void body.start({
      scaleY: [1, 0.82, 1.12, 0.96, 1],
      scaleX: [1, 1.14, 0.92, 1.03, 1],
      y: [0, 3, -14, 0, 0],
      transition: { duration: 0.65, ease: 'easeOut' },
    })
  }, [mood, body])

  const eyesClosed = blink || mood === 'sleepy'
  const bob = mood === 'sleepy' ? { y: [0, 2, 0], transition: { duration: 3.2, repeat: Infinity } } : { y: [0, -5, 0], transition: { duration: mood === 'working' ? 0.9 : 2.4, repeat: Infinity, ease: 'easeInOut' as const } }

  return (
    <div className={cn('relative inline-block select-none', className)} style={{ width: size, height: size * 1.17 }}>
      <AnimatePresence>
        {say && (
          <motion.div
            key={String(typeof say === 'string' ? say : 'node')}
            initial={{ opacity: 0, scale: 0.6, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 4 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className={cn(
              'absolute z-10 w-max max-w-[220px] rounded-2xl border border-line-strong bg-fg px-3 py-2 text-[12.5px] font-medium leading-snug text-ink shadow-[0_12px_40px_-12px_rgb(0_0_0/0.8)]',
              bubble === 'right' && 'left-[88%] top-[8%] origin-bottom-left rounded-bl-sm',
              bubble === 'left' && 'right-[88%] top-[8%] origin-bottom-right rounded-br-sm',
              bubble === 'top' && 'bottom-[102%] left-1/2 -translate-x-1/2 origin-bottom',
            )}
          >
            {say}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.svg
        ref={root}
        viewBox="0 0 120 140"
        width={size}
        height={size * 1.17}
        className={cn('overflow-visible', onClick && 'cursor-pointer')}
        onClick={() => {
          onClick?.()
          void body.start({ rotate: [0, -12, 10, -6, 0], transition: { duration: 0.6 } })
        }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
      >
        <defs>
          <radialGradient id={`body-${id}`} cx="42%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#ffe3a3" />
            <stop offset="35%" stopColor="#ffb547" />
            <stop offset="72%" stopColor="#ff6a3d" />
            <stop offset="100%" stopColor="#d93a1c" />
          </radialGradient>
          <radialGradient id={`glow-${id}`}>
            <stop offset="0%" stopColor="#ff6a3d" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ff6a3d" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* shadow that shrinks when he jumps */}
        <motion.ellipse cx="60" cy="134" rx="26" ry="4.5" fill="black" opacity={0.45} animate={{ rx: [26, 22, 26] }} transition={{ duration: 2.4, repeat: Infinity }} />
        <circle cx="60" cy="82" r="58" fill={`url(#glow-${id})`} />

        <motion.g animate={bob}>
          <motion.g animate={body} style={{ originX: '60px', originY: '128px' }}>
            {/* flickering flame tips */}
            <motion.path
              fill="#ffb547"
              animate={{
                d: [
                  'M60 6 C64 18 72 22 70 34 C68 26 63 26 60 32 C57 26 52 26 50 34 C48 22 56 18 60 6Z',
                  'M58 2 C66 16 74 24 71 35 C67 28 63 27 60 33 C57 27 53 27 49 35 C47 24 52 14 58 2Z',
                  'M62 4 C66 17 71 23 70 34 C67 26 63 26 60 32 C57 26 52 26 50 34 C49 21 58 16 62 4Z',
                ],
              }}
              transition={{ duration: 0.9, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
            />
            {/* body */}
            <path d="M60 22 C84 44 102 62 102 88 C102 113 83 129 60 129 C37 129 18 113 18 88 C18 62 36 44 60 22Z" fill={`url(#body-${id})`} />
            <ellipse cx="44" cy="62" rx="10" ry="15" fill="white" opacity="0.28" transform="rotate(-24 44 62)" />

            {/* little arms */}
            <motion.path
              d="M20 92 Q8 88 6 78"
              stroke="#ff6a3d"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
              animate={mood === 'party' ? { rotate: [0, -30, 0] } : { rotate: 0 }}
              transition={{ duration: 0.4, repeat: mood === 'party' ? Infinity : 0 }}
              style={{ originX: '20px', originY: '92px' }}
            />
            <motion.path
              d="M100 92 Q112 88 114 78"
              stroke="#ff6a3d"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
              animate={mood === 'party' || mood === 'happy' ? { rotate: [0, 28, 0] } : { rotate: 0 }}
              transition={{ duration: mood === 'party' ? 0.4 : 1.6, repeat: Infinity, repeatDelay: mood === 'happy' ? 2.5 : 0 }}
              style={{ originX: '100px', originY: '92px' }}
            />

            {/* eyes */}
            {[46, 74].map((cx) => (
              <g key={cx}>
                {eyesClosed ? (
                  <path d={`M${cx - 8} 85 Q${cx} ${mood === 'sleepy' ? 89 : 87} ${cx + 8} 85`} stroke="#2a0e05" strokeWidth="3" strokeLinecap="round" fill="none" />
                ) : (
                  <>
                    <ellipse cx={cx} cy="84" rx="9.5" ry={mood === 'curious' ? 12 : 10.5} fill="white" />
                    <motion.circle cx={cx} cy="85" r={mood === 'worried' ? 3.6 : 5} fill="#1b0904" style={{ x: px, y: py }} />
                    <motion.circle cx={cx + 2} cy="82" r="1.6" fill="white" style={{ x: px, y: py }} />
                  </>
                )}
                {mood === 'worried' && <path d={`M${cx - 9} ${cx < 60 ? 70 : 66} L${cx + 7} ${cx < 60 ? 66 : 70}`} stroke="#2a0e05" strokeWidth="2.6" strokeLinecap="round" />}
              </g>
            ))}
            <ellipse cx="36" cy="99" rx="6" ry="3.6" fill="#ff4d6d" opacity="0.45" />
            <ellipse cx="84" cy="99" rx="6" ry="3.6" fill="#ff4d6d" opacity="0.45" />

            <motion.path
              animate={{ d: MOUTHS[mood] }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              fill={mood === 'party' ? '#5a1406' : 'none'}
              stroke="#2a0e05"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.g>
        </motion.g>

        {/* mood extras */}
        <AnimatePresence>
          {mood === 'worried' && (
            <motion.path
              key="sweat"
              d="M98 58 Q103 66 98 70 Q93 66 98 58Z"
              fill="#7dd3fc"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: [0, 1, 1, 0], y: [-4, 0, 10, 16] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
          )}
          {mood === 'sleepy' &&
            [0, 1, 2].map((i) => (
              <motion.text
                key={'z' + i}
                x={92 + i * 7}
                y={48 - i * 10}
                fontSize={10 + i * 3}
                fontWeight={700}
                fill="#9a9aa3"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0], y: [0, -10, -18] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.6 }}
              >
                z
              </motion.text>
            ))}
          {mood === 'party' &&
            [
              [10, 30, '#5eead4'],
              [108, 26, '#a78bfa'],
              [16, 120, '#ffb547'],
              [106, 112, '#f472b6'],
              [60, -4, '#ecebe8'],
            ].map(([x, y, c], i) => (
              <motion.path
                key={'s' + i}
                d={`M${x} ${Number(y) - 6} L${Number(x) + 1.8} ${Number(y) - 1.8} L${Number(x) + 6} ${y} L${Number(x) + 1.8} ${Number(y) + 1.8} L${x} ${Number(y) + 6} L${Number(x) - 1.8} ${Number(y) + 1.8} L${Number(x) - 6} ${y} L${Number(x) - 1.8} ${Number(y) - 1.8}Z`}
                fill={String(c)}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.3, 0], opacity: [0, 1, 0], rotate: [0, 90] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.22 }}
                style={{ originX: `${x}px`, originY: `${y}px` }}
              />
            ))}
          {mood === 'working' && (
            <motion.g key="gear" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} style={{ originX: '104px', originY: '40px' }}>
              <circle cx="104" cy="40" r="7" fill="none" stroke="#5eead4" strokeWidth="3" strokeDasharray="4 3" />
            </motion.g>
          )}
        </AnimatePresence>
      </motion.svg>
    </div>
  )
}
