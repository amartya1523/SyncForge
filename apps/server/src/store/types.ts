import type { Op, StateVector } from '@syncforge/crdt'
import type { LinkRole, Role, UserInfo, Version } from '@syncforge/sync/protocol'

export interface DocMeta {
  id: string
  title: string
  owner: string
  linkRole: LinkRole
  createdAt: number
  updatedAt: number
}

/**
 * Persistence boundary. Two implementations: in-memory (zero setup, used by tests
 * and `npm run dev`) and Postgres (used when DATABASE_URL is set).
 */
export interface Store {
  init(): Promise<void>
  close(): Promise<void>

  upsertUser(u: UserInfo): Promise<void>
  getUsers(ids: string[]): Promise<UserInfo[]>

  createDoc(d: DocMeta): Promise<void>
  getDoc(id: string): Promise<DocMeta | null>
  updateDoc(id: string, patch: Partial<Pick<DocMeta, 'title' | 'linkRole' | 'updatedAt'>>): Promise<void>
  /** owned, shared with, or recently opened by this user */
  listDocs(userId: string): Promise<Array<DocMeta & { role: Role }>>
  recordVisit(docId: string, userId: string): Promise<void>

  getMemberRole(docId: string, userId: string): Promise<Role | null>
  setMemberRole(docId: string, userId: string, role: Role): Promise<void>

  /**
   * Bind a CRDT client id to a user the first time it is seen. Returns the owner,
   * which may be someone else — that's how forged authorship is caught.
   */
  claimClient(clientId: string, userId: string): Promise<string>
  clientOwners(clientIds: string[]): Promise<Record<string, string>>

  loadOps(docId: string): Promise<Op[]>
  appendOps(docId: string, ops: Op[]): Promise<void>
  /** replace the op log with a compact snapshot; implementations must merge, never overwrite */
  compact(docId: string, snapshot: Op[], sv: StateVector): Promise<void>

  listVersions(docId: string): Promise<Version[]>
  addVersion(v: Version): Promise<void>
}
