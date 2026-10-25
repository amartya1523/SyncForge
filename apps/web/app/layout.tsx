import type { Metadata } from 'next'
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument' })

export const metadata: Metadata = {
  title: 'SyncForge — real-time collaboration engine',
  description: 'A from-scratch CRDT collaboration engine: shared docs, whiteboards, offline-first sync and version time-travel.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable} ${instrument.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
