import { Doc, type Op } from '@syncforge/crdt'
import type { Role, UserInfo, Version } from '@syncforge/sync/protocol'
import type { DocMeta, Store } from './types'

export class MemoryStore implements Store {
  private users = new Map<string, UserInfo>()
  private docs = new Map<string, DocMeta>()
  private members = new Map<string, Map<string, Role>>()
  private visits = new Map<string, Map<string, number>>()
  private clients = new Map<string, string>()
  private ops = new Map<string, Op[]>()
  private versions = new Map<string, Version[]>()

  async init() {}
  async close() {}

  async upsertUser(u: UserInfo) {
    this.users.set(u.id, u)
  }

  async getUsers(ids: string[]) {
    return ids.map((id) => this.users.get(id)).filter((u): u is UserInfo => !!u)
  }

  async createDoc(d: DocMeta) {
    this.docs.set(d.id, { ...d })
  }

  async getDoc(id: string) {
    const d = this.docs.get(id)
    return d ? { ...d } : null
  }

  async updateDoc(id: string, patch: Partial<DocMeta>) {
    const d = this.docs.get(id)
    if (d) Object.assign(d, patch)
  }

  async listDocs(userId: string) {
    const out: Array<DocMeta & { role: Role }> = []
    for (const d of this.docs.values()) {
      const member = this.members.get(d.id)?.get(userId)
      const visited = this.visits.get(d.id)?.has(userId)
      if (d.owner === userId) out.push({ ...d, role: 'owner' })
      else if (member) out.push({ ...d, role: member })
      else if (visited && d.linkRole !== 'none') out.push({ ...d, role: d.linkRole })
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async recordVisit(docId: string, userId: string) {
    let m = this.visits.get(docId)
    if (!m) this.visits.set(docId, (m = new Map()))
    m.set(userId, Date.now())
  }

  async getMemberRole(docId: string, userId: string) {
    return this.members.get(docId)?.get(userId) ?? null
  }

  async setMemberRole(docId: string, userId: string, role: Role) {
    let m = this.members.get(docId)
    if (!m) this.members.set(docId, (m = new Map()))
    m.set(userId, role)
  }

  async claimClient(clientId: string, userId: string) {
    const owner = this.clients.get(clientId)
    if (owner) return owner
    this.clients.set(clientId, userId)
    return userId
  }

  async clientOwners(ids: string[]) {
    const out: Record<string, string> = {}
    for (const id of ids) {
      const owner = this.clients.get(id)
      if (owner) out[id] = owner
    }
    return out
  }

  async loadOps(docId: string) {
    return [...(this.ops.get(docId) ?? [])]
  }

  async appendOps(docId: string, ops: Op[]) {
    let log = this.ops.get(docId)
    if (!log) this.ops.set(docId, (log = []))
    log.push(...ops)
  }

  async compact(docId: string) {
    // merge whatever is stored into one compact snapshot
    const d = new Doc({ clientId: 'compactor' })
    d.apply(this.ops.get(docId) ?? [])
    this.ops.set(docId, d.encode())
  }

  async listVersions(docId: string) {
    return [...(this.versions.get(docId) ?? [])].sort((a, b) => b.createdAt - a.createdAt)
  }

  async addVersion(v: Version) {
    let list = this.versions.get(v.docId)
    if (!list) this.versions.set(v.docId, (list = []))
    list.push(v)
  }
}
