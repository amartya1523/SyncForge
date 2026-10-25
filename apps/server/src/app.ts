import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { ClientMsg, LinkRole, Role } from '@syncforge/sync/protocol'
import { WebSocketServer, type WebSocket } from 'ws'
import { colorFor, issueInvite, issueSession, newId, readInvite, readSession } from './auth'
import type { Bus } from './bus/types'
import { config } from './config'
import { type Conn, Room, resolveRole, send } from './room'
import type { Store } from './store/types'

export interface AppDeps {
  store: Store
  bus: Bus
  serverId: string
}

const LINK_ROLES: LinkRole[] = ['none', 'viewer', 'commenter', 'editor']
const INVITE_ROLES: Role[] = ['viewer', 'commenter', 'editor']

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Token bucket: short bursts (a paste, a reconnect upload) are fine, floods are not. */
class Bucket {
  private tokens: number
  private last = Date.now()
  constructor(
    private capacity: number,
    private perSecond: number,
  ) {
    this.tokens = capacity
  }
  take(): boolean {
    const now = Date.now()
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens--
    return true
  }
}

export function createApp({ store, bus, serverId }: AppDeps) {
  const rooms = new Map<string, Promise<Room>>()

  async function getRoom(id: string): Promise<Room> {
    let p = rooms.get(id)
    if (!p) {
      p = (async () => {
        const meta = await store.getDoc(id)
        if (!meta) throw new HttpError(404, 'not found')
        const room = new Room(id, { store, bus, serverId }, (r) => {
          if (rooms.get(r.id) === p) rooms.delete(r.id)
        })
        await room.load(meta)
        return room
      })()
      rooms.set(id, p)
      p.catch(() => rooms.delete(id))
    }
    return p
  }

  async function loadedRoom(id: string) {
    const p = rooms.get(id)
    return p ? p.catch(() => null) : null
  }

  // ------------------------------------------------------------------ HTTP

  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const c of req) {
      size += (c as Buffer).length
      if (size > 64 * 1024) throw new HttpError(413, 'body too large')
      chunks.push(c as Buffer)
    }
    if (!chunks.length) return {}
    try {
      return JSON.parse(Buffer.concat(chunks).toString())
    } catch {
      throw new HttpError(400, 'invalid json')
    }
  }

  function auth(req: IncomingMessage) {
    const user = readSession(req.headers.authorization?.replace(/^Bearer /, ''))
    if (!user) throw new HttpError(401, 'sign in first')
    return user
  }

  async function ownedDoc(id: string, userId: string) {
    const doc = await store.getDoc(id)
    if (!doc) throw new HttpError(404, 'not found')
    if (doc.owner !== userId) throw new HttpError(403, 'only the owner can do that')
    return doc
  }

  type Handler = (req: IncomingMessage, params: string[]) => Promise<unknown>
  const routes: Array<[string, RegExp, Handler]> = [
    ['GET', /^\/api\/health$/, async () => ({ ok: true, server: serverId })],

    ['GET', /^\/api\/stats$/, async () => {
      const list = await Promise.all([...rooms.values()].map((p) => p.catch(() => null)))
      const live = list.filter((r): r is Room => !!r)
      return {
        server: serverId,
        rooms: live.length,
        connections: live.reduce((n, r) => n + r.conns.size, 0),
        memoryMb: Math.round(process.memoryUsage().rss / 1e6),
      }
    }],

    ['POST', /^\/api\/session$/, async (req) => {
      const { name, userId } = await body(req)
      const clean = String(name ?? '').trim().slice(0, 40)
      if (!clean) throw new HttpError(400, 'name required')
      // re-use the id when renaming, so your documents stay yours
      const current = readSession(req.headers.authorization?.replace(/^Bearer /, ''))
      const id = current && current.id === userId ? current.id : newId('u')
      const user = { id, name: clean, color: colorFor(id) }
      await store.upsertUser(user)
      return { token: issueSession(user), user }
    }],

    ['GET', /^\/api\/docs$/, async (req) => {
      const user = auth(req)
      return { docs: await store.listDocs(user.id) }
    }],

    ['POST', /^\/api\/docs$/, async (req) => {
      const user = auth(req)
      const { title } = await body(req)
      const now = Date.now()
      const doc = {
        id: newId(),
        title: String(title ?? '').trim().slice(0, 120) || 'Untitled document',
        owner: user.id,
        linkRole: 'editor' as LinkRole,
        createdAt: now,
        updatedAt: now,
      }
      await store.createDoc(doc)
      return { doc }
    }],

    ['GET', /^\/api\/docs\/(\w+)$/, async (req, [id]) => {
      const user = auth(req)
      const doc = await store.getDoc(id)
      if (!doc) throw new HttpError(404, 'not found')
      const role = await resolveRole(store, doc, user.id)
      if (!role) throw new HttpError(403, 'no access')
      return { doc, role }
    }],

    ['PATCH', /^\/api\/docs\/(\w+)$/, async (req, [id]) => {
      const user = auth(req)
      await ownedDoc(id, user.id)
      const { linkRole } = await body(req)
      if (!LINK_ROLES.includes(linkRole as LinkRole)) throw new HttpError(400, 'bad linkRole')
      await store.updateDoc(id, { linkRole: linkRole as LinkRole })
      ;(await loadedRoom(id))?.recheckAccess()
      bus.publish(id, { k: 'access' })
      return { ok: true }
    }],

    ['POST', /^\/api\/docs\/(\w+)\/invites$/, async (req, [id]) => {
      const user = auth(req)
      await ownedDoc(id, user.id)
      const { role } = await body(req)
      if (!INVITE_ROLES.includes(role as Role)) throw new HttpError(400, 'bad role')
      return { token: issueInvite(id, role as Role) }
    }],

    ['POST', /^\/api\/invites\/accept$/, async (req) => {
      const user = auth(req)
      const { token } = await body(req)
      const invite = readInvite(String(token ?? ''))
      if (!invite) throw new HttpError(400, 'invite expired or invalid')
      const doc = await store.getDoc(invite.docId)
      if (!doc) throw new HttpError(404, 'not found')
      if (doc.owner !== user.id) {
        await store.setMemberRole(doc.id, user.id, invite.role)
        ;(await loadedRoom(doc.id))?.recheckAccess()
        bus.publish(doc.id, { k: 'access' })
      }
      return { docId: doc.id, role: invite.role }
    }],

    ['GET', /^\/api\/docs\/(\w+)\/export$/, async (req, [id]) => {
      const user = auth(req)
      const doc = await store.getDoc(id)
      if (!doc || !(await resolveRole(store, doc, user.id))) throw new HttpError(404, 'not found')
      const room = await getRoom(id)
      return { title: room.title, text: room.doc.text() }
    }],
  ]

  async function onRequest(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigin)
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    if (req.method === 'OPTIONS') return void res.writeHead(204).end()

    const path = new URL(req.url ?? '/', 'http://x').pathname
    try {
      for (const [method, re, handler] of routes) {
        const m = method === req.method ? re.exec(path) : null
        if (!m) continue
        const out = await handler(req, m.slice(1))
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out))
        return
      }
      throw new HttpError(404, 'no such route')
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500
      if (status === 500) console.error(err)
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: (err as Error).message }))
    }
  }

  // ------------------------------------------------------------------ WebSocket

  const server = createServer(onRequest)
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 * 1024 })
  const alive = new WeakMap<WebSocket, boolean>()

  wss.on('connection', (ws) => {
    alive.set(ws, true)
    ws.on('pong', () => alive.set(ws, true))

    let conn: Conn | null = null
    let room: Room | null = null
    const bucket = new Bucket(400, 200)
    // nothing happens until a valid hello arrives
    const helloTimer = setTimeout(() => ws.close(4001, 'hello timeout'), 5000)
    const fail = (code: 'unauthorized' | 'forbidden' | 'not_found' | 'bad_request', message: string) => {
      ws.send(JSON.stringify({ t: 'error', code, message }))
      ws.close(4000 + (code === 'unauthorized' ? 1 : code === 'forbidden' ? 3 : 4), message)
    }
    let chain = Promise.resolve()

    ws.on('message', (raw) => {
      if (!bucket.take()) {
        ws.send(JSON.stringify({ t: 'error', code: 'rate_limited', message: 'slow down' }))
        return
      }
      let msg: ClientMsg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return fail('bad_request', 'invalid json')
      }
      // handle messages strictly in order even though some handlers are async
      chain = chain.then(() => handle(msg)).catch((err) => console.error('[ws]', err))
    })

    async function handle(msg: ClientMsg) {
      if (msg.t === 'hello') {
        if (conn) return
        clearTimeout(helloTimer)
        const user = readSession(msg.token)
        if (!user) return fail('unauthorized', 'session expired, sign in again')
        const meta = await store.getDoc(String(msg.doc))
        if (!meta) return fail('not_found', 'document not found')
        const role = await resolveRole(store, meta, user.id)
        if (!role) return fail('forbidden', 'you do not have access to this document')
        room = await getRoom(meta.id)
        if (ws.readyState !== ws.OPEN) return
        conn = { id: newId('c'), ws, user, role, state: {} }
        room.join(conn, msg.sv && typeof msg.sv === 'object' ? msg.sv : {})
        void store.recordVisit(meta.id, user.id).catch(() => {})
        return
      }
      if (!conn || !room) return

      switch (msg.t) {
        case 'ops': {
          const err = await room.receive(conn, msg.ops)
          if (err) send(conn, { t: 'error', code: err as 'read_only', message: `ops rejected: ${err}` })
          break
        }
        case 'sync':
          room.syncFor(conn, msg.sv ?? {})
          break
        case 'awareness':
          room.setAwareness(conn, msg.state)
          break
        case 'version':
          if (conn.role === 'editor' || conn.role === 'owner') await room.createVersion(String(msg.name ?? ''), conn.user)
          break
        case 'ping':
          send(conn, { t: 'pong' })
          break
      }
    }

    ws.on('close', () => {
      clearTimeout(helloTimer)
      if (conn && room) room.leave(conn)
    })
  })

  // half-open TCP connections never fire 'close' on their own
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate()
        continue
      }
      alive.set(ws, false)
      ws.ping()
    }
  }, 20_000)

  return {
    server,
    rooms,
    listen(port: number) {
      return new Promise<number>((resolve) => {
        server.listen(port, () => {
          const addr = server.address()
          resolve(typeof addr === 'object' && addr ? addr.port : port)
        })
      })
    },
    async close() {
      clearInterval(heartbeat)
      const list = await Promise.all([...rooms.values()].map((p) => p.catch(() => null)))
      await Promise.all(list.map((r) => r?.close()))
      for (const ws of wss.clients) ws.terminate()
      await new Promise<void>((r) => wss.close(() => r()))
      await new Promise<void>((r) => server.close(() => r()))
    },
  }
}
