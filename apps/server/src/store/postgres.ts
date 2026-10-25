import { Doc, type Op, opLength } from '@syncforge/crdt'
import type { Role, UserInfo, Version } from '@syncforge/sync/protocol'
import pg from 'pg'
import type { DocMeta, Store } from './types'

const SCHEMA = `
create table if not exists users (
  id text primary key,
  name text not null,
  color text not null,
  created_at timestamptz not null default now()
);
create table if not exists docs (
  id text primary key,
  title text not null,
  owner text not null references users(id),
  link_role text not null default 'editor',
  created_at bigint not null,
  updated_at bigint not null
);
create table if not exists members (
  doc_id text not null references docs(id) on delete cascade,
  user_id text not null references users(id),
  role text not null,
  primary key (doc_id, user_id)
);
create table if not exists visits (
  doc_id text not null references docs(id) on delete cascade,
  user_id text not null,
  at bigint not null,
  primary key (doc_id, user_id)
);
create table if not exists client_owners (
  client_id text primary key,
  user_id text not null
);
-- append-only op log; (doc, client, clock) makes double-writes from two servers harmless
create table if not exists ops (
  seq bigserial,
  doc_id text not null,
  client text not null,
  clock integer not null,
  clock_end integer not null,
  op jsonb not null,
  primary key (doc_id, client, clock)
);
create index if not exists ops_doc_seq on ops (doc_id, seq);
create table if not exists snapshots (
  doc_id text primary key,
  ops jsonb not null,
  sv jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists versions (
  id text primary key,
  doc_id text not null,
  name text not null,
  auto boolean not null,
  author jsonb,
  created_at bigint not null,
  sv jsonb not null,
  maps jsonb not null,
  preview text not null,
  chars integer not null
);
create index if not exists versions_doc on versions (doc_id, created_at desc);
`

type Row = Record<string, unknown>

const toDoc = (r: Row): DocMeta => ({
  id: r.id as string,
  title: r.title as string,
  owner: r.owner as string,
  linkRole: r.link_role as DocMeta['linkRole'],
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
})

export class PostgresStore implements Store {
  private pool: pg.Pool

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 10 })
  }

  async init() {
    // "create table if not exists" is not atomic: two nodes booting together can both
    // try to create the same table. Serialise migrations across the cluster.
    const c = await this.pool.connect()
    try {
      await c.query('select pg_advisory_lock(7361)')
      await c.query(SCHEMA)
    } finally {
      await c.query('select pg_advisory_unlock(7361)').catch(() => {})
      c.release()
    }
  }

  async close() {
    await this.pool.end()
  }

  async upsertUser(u: UserInfo) {
    await this.pool.query(
      `insert into users (id, name, color) values ($1, $2, $3)
       on conflict (id) do update set name = excluded.name, color = excluded.color`,
      [u.id, u.name, u.color],
    )
  }

  async getUsers(ids: string[]) {
    if (!ids.length) return []
    const { rows } = await this.pool.query('select id, name, color from users where id = any($1)', [ids])
    return rows as UserInfo[]
  }

  async createDoc(d: DocMeta) {
    await this.pool.query(
      'insert into docs (id, title, owner, link_role, created_at, updated_at) values ($1,$2,$3,$4,$5,$6)',
      [d.id, d.title, d.owner, d.linkRole, d.createdAt, d.updatedAt],
    )
  }

  async getDoc(id: string) {
    const { rows } = await this.pool.query('select * from docs where id = $1', [id])
    return rows[0] ? toDoc(rows[0]) : null
  }

  async updateDoc(id: string, patch: Partial<DocMeta>) {
    const cols: string[] = []
    const vals: unknown[] = []
    const add = (col: string, v: unknown) => {
      if (v === undefined) return
      vals.push(v)
      cols.push(`${col} = $${vals.length}`)
    }
    add('title', patch.title)
    add('link_role', patch.linkRole)
    add('updated_at', patch.updatedAt)
    if (!cols.length) return
    vals.push(id)
    await this.pool.query(`update docs set ${cols.join(', ')} where id = $${vals.length}`, vals)
  }

  async listDocs(userId: string) {
    const { rows } = await this.pool.query(
      `select d.*, case when d.owner = $1 then 'owner' else coalesce(m.role, d.link_role) end as role
         from docs d
         left join members m on m.doc_id = d.id and m.user_id = $1
         left join visits v on v.doc_id = d.id and v.user_id = $1
        where d.owner = $1 or m.user_id is not null or (v.user_id is not null and d.link_role <> 'none')
        order by d.updated_at desc
        limit 100`,
      [userId],
    )
    return rows.map((r) => ({ ...toDoc(r), role: r.role as Role }))
  }

  async recordVisit(docId: string, userId: string) {
    await this.pool.query(
      `insert into visits (doc_id, user_id, at) values ($1, $2, $3)
       on conflict (doc_id, user_id) do update set at = excluded.at`,
      [docId, userId, Date.now()],
    )
  }

  async getMemberRole(docId: string, userId: string) {
    const { rows } = await this.pool.query('select role from members where doc_id = $1 and user_id = $2', [docId, userId])
    return (rows[0]?.role as Role) ?? null
  }

  async setMemberRole(docId: string, userId: string, role: Role) {
    await this.pool.query(
      `insert into members (doc_id, user_id, role) values ($1, $2, $3)
       on conflict (doc_id, user_id) do update set role = excluded.role`,
      [docId, userId, role],
    )
  }

  async claimClient(clientId: string, userId: string) {
    const { rows } = await this.pool.query(
      `insert into client_owners (client_id, user_id) values ($1, $2)
       on conflict (client_id) do update set client_id = excluded.client_id
       returning user_id`,
      [clientId, userId],
    )
    return rows[0].user_id as string
  }

  async clientOwners(ids: string[]) {
    if (!ids.length) return {}
    const { rows } = await this.pool.query('select client_id, user_id from client_owners where client_id = any($1)', [ids])
    return Object.fromEntries(rows.map((r) => [r.client_id, r.user_id]))
  }

  async loadOps(docId: string) {
    const snap = await this.pool.query('select ops from snapshots where doc_id = $1', [docId])
    const log = await this.pool.query('select op from ops where doc_id = $1 order by seq', [docId])
    return [...((snap.rows[0]?.ops as Op[]) ?? []), ...log.rows.map((r) => r.op as Op)]
  }

  async appendOps(docId: string, ops: Op[]) {
    if (!ops.length) return
    await this.pool.query(
      `insert into ops (doc_id, client, clock, clock_end, op)
       select $1, * from unnest($2::text[], $3::int[], $4::int[], $5::jsonb[])
       on conflict do nothing`,
      [
        docId,
        ops.map((o) => o.id.client),
        ops.map((o) => o.id.clock),
        ops.map((o) => o.id.clock + opLength(o)),
        ops.map((o) => JSON.stringify(o)),
      ],
    )
  }

  /**
   * Two servers may compact the same room at once. Instead of last-write-wins on the
   * snapshot row (which could drop ops), we take an advisory lock, CRDT-merge the
   * stored snapshot + log + our snapshot, and only delete log rows the merge covers.
   */
  async compact(docId: string, snapshot: Op[]) {
    const c = await this.pool.connect()
    try {
      await c.query('begin')
      await c.query('select pg_advisory_xact_lock(hashtext($1))', [docId])
      const snap = await c.query('select ops from snapshots where doc_id = $1', [docId])
      const log = await c.query('select op from ops where doc_id = $1 order by seq', [docId])

      const merged = new Doc({ clientId: 'compactor' })
      merged.apply((snap.rows[0]?.ops as Op[]) ?? [])
      merged.apply(log.rows.map((r) => r.op as Op))
      merged.apply(snapshot)
      const sv = merged.stateVector()

      await c.query(
        `insert into snapshots (doc_id, ops, sv, updated_at) values ($1, $2, $3, now())
         on conflict (doc_id) do update set ops = excluded.ops, sv = excluded.sv, updated_at = now()`,
        [docId, JSON.stringify(merged.encode()), JSON.stringify(sv)],
      )
      await c.query(
        `delete from ops where doc_id = $1 and clock_end <= coalesce(($2::jsonb ->> client)::int, 0)`,
        [docId, JSON.stringify(sv)],
      )
      await c.query('commit')
    } catch (err) {
      await c.query('rollback')
      throw err
    } finally {
      c.release()
    }
  }

  async listVersions(docId: string) {
    const { rows } = await this.pool.query('select * from versions where doc_id = $1 order by created_at desc limit 200', [docId])
    return rows.map(
      (r): Version => ({
        id: r.id,
        docId: r.doc_id,
        name: r.name,
        auto: r.auto,
        author: r.author,
        createdAt: Number(r.created_at),
        sv: r.sv,
        maps: r.maps,
        preview: r.preview,
        chars: r.chars,
      }),
    )
  }

  async addVersion(v: Version) {
    await this.pool.query(
      `insert into versions (id, doc_id, name, auto, author, created_at, sv, maps, preview, chars)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing`,
      [v.id, v.docId, v.name, v.auto, JSON.stringify(v.author), v.createdAt, JSON.stringify(v.sv), JSON.stringify(v.maps), v.preview, v.chars],
    )
  }
}
