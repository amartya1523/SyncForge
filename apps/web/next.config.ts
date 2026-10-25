import path from 'node:path'
import type { NextConfig } from 'next'

const config: NextConfig = {
  // the CRDT and sync packages ship TypeScript source
  transpilePackages: ['@syncforge/crdt', '@syncforge/sync'],
  turbopack: { root: path.join(__dirname, '../..') },
  devIndicators: false,
  agentRules: false,
  // lets you open a second "user" on 127.0.0.1 (separate localStorage) during dev
  allowedDevOrigins: ['127.0.0.1'],
}

export default config
