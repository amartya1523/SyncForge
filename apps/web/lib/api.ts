import { serverUrl } from './config'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, opts: { token?: string; body?: unknown; method?: string } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(serverUrl() + path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: 'Bearer ' + opts.token } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the sync server. Is it running? (npm run dev)')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, json.error ?? res.statusText)
  return json as T
}
