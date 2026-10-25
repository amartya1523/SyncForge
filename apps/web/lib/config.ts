const DEFAULT_SERVER = process.env.NEXT_PUBLIC_SYNC_URL ?? 'http://localhost:4000'

/**
 * Which sync node to talk to. `?node=4101` (or a full URL) lets you open two tabs
 * against two different servers to watch the Redis fan-out work.
 */
export function serverUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_SERVER
  const node = new URLSearchParams(window.location.search).get('node')
  if (!node) return DEFAULT_SERVER
  if (/^\d+$/.test(node)) return `${window.location.protocol}//${window.location.hostname}:${node}`
  return node
}

export function wsUrl(): string {
  return serverUrl().replace(/^http/, 'ws') + '/ws'
}
