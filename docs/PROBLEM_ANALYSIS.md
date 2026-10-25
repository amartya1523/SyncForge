# SyncForge — Problem Analysis

Before writing any code I wanted to be sure what problem we are actually solving,
because "build Google Docs" hides a dozen separate hard problems. This document is
the result of that pass: the scenario, what can go wrong, and the decision I made
for each one. Everything in the codebase traces back to a section here.

---

## 1. The scenario, restated precisely

Five people, one technical document:

| User | Action | What it really stresses |
|------|--------|-------------------------|
| A | Writes a paragraph | Concurrent inserts, cursor stability for everyone else |
| B | Deletes words **inside A's paragraph** at the same time | Insert/delete on overlapping ranges |
| C | Is offline, editing a stale copy | Divergence for minutes/hours, then a large merge |
| D | Adds comments | Anchors that must survive the text under them changing |
| E | Restores an older version | A "go back in time" that must not erase A, B, C, D |

The success criterion is not "it looks merged". It is:

> **Strong eventual consistency** — any two replicas that have received the same
> *set* of operations are in the identical state, regardless of the order, timing or
> number of times those operations arrived.

That sentence is testable, and the test suite is built around it (§10).

### Is this even the right problem?

Two families of solutions exist:

* **Operational Transformation (OT)** — Google Docs' original approach. Needs a central
  server to define a total order and transform functions for every pair of operation
  types. Offline editing for long periods is painful because the transform chain grows.
* **CRDTs** — every operation carries enough metadata (unique IDs, causal origins) that
  replicas merge without coordination.

User C (offline for an unbounded time) and the "multiple WebSocket servers" requirement
both point to CRDTs: no server needs to be the single source of ordering, and a client
can be offline for a week and still merge deterministically. So the core of SyncForge
is a CRDT, and the server becomes a *relay + durable replica*, not an arbiter.

---

## 2. Edge cases in the text CRDT

### 2.1 Concurrent inserts at the same position
A types `X` and B types `Y` at index 3 at the same time. Both replicas must pick the
same order. **Decision:** each character gets an ID `(clientId, clock)`, and an insert
records its *left origin* and *right origin* (the neighbours it was typed between). The
integration rule is YATA (the algorithm behind Yjs), re-implemented from scratch in
`packages/crdt`. Ties among concurrent siblings are broken by `clientId`.

### 2.2 Interleaving anomaly
If A types `HELLO` and B types `WORLD` at the same spot, a naive "sort by timestamp"
CRDT can produce `HWEOLRLLOD`. Unreadable. Because every char's left origin is the
previous char *of the same run*, YATA keeps runs together → `HELLOWORLD` or
`WORLDHELLO`, never interleaved. There is an explicit test for this.

### 2.3 Delete vs concurrent insert in the same range (A + B)
B deletes `quick brown` while A inserts `very ` between `quick` and `brown`.
Deleted characters become **tombstones** — they stay in the sequence, invisible.
A's insert references a tombstone as its origin, so it still lands exactly where A
intended. Result: `very ` survives, `quick brown` is gone. No crash, no lost intent.

### 2.4 Out-of-order and missing dependencies
Network reorders: a delete can arrive before the insert it deletes; char #5 of a run
can arrive before char #4. **Decision:** ops are applied only when causally ready
(same-client predecessor present, origins present, delete targets present). Otherwise
they sit in a pending buffer which is retried after every successful integration.

### 2.5 Duplicate delivery
Reconnects and multi-server fan-out duplicate messages. **Decision:** every op has a
unique ID and every replica keeps a *state vector* `{clientId → next expected clock}`.
An op whose clock is below the vector is dropped. Operations are idempotent by
construction.

### 2.6 Two tabs, same client ID → silent corruption
If two tabs reuse the same `clientId`, they will both mint `(c, 7)` for different
characters — the replicas diverge forever and nothing detects it. **Decision:** a
fresh `clientId` is generated for every session. Old offline edits keep their old IDs;
the state vector simply has more entries.

### 2.7 Unicode
Textareas index by UTF-16 code unit. An emoji is two units. **Decision:** the CRDT
stores code units (so indices match the DOM exactly) and the local diff routine never
splits a surrogate pair. Grapheme clusters (ZWJ family emoji) can still be split by two
users editing the exact middle concurrently — documented, acceptable.

### 2.8 Tombstone growth
A document edited for a year is mostly tombstones. Garbage-collecting them requires
knowing that *every* replica has seen the delete — impossible with clients that can be
offline indefinitely, and it would also destroy version history. **Decision:** keep
text tombstones (a tombstone is a few bytes), but compact *overwritten* whiteboard
updates into tiny `gc` ranges — dragging a shape 300 times leaves one live op.

---

## 3. Offline-first (User C)

| Problem | Decision |
|--------|----------|
| Page closed while offline | Full CRDT state saved to IndexedDB (debounced), restored before the socket opens |
| What do we send on reconnect? | Client sends its state vector; server answers with exactly the ops the client lacks, and vice versa. No "send everything" |
| Server restarted / log compacted while C was away | Diffs are computed from the CRDT state itself, not from a raw log, so a compacted server can still serve any client |
| C's text references text others deleted | It still lands at C's intended spot (tombstone origins). The CRDT preserves intent; semantics like "this sentence no longer makes sense" are a human concern |
| How does C know what's not synced yet? | Server acks with its state vector; UI shows "N changes waiting to sync" |
| Reconnect storm after a server deploy | Exponential backoff with jitter |
| Two offline tabs | Tabs relay ops to each other with `BroadcastChannel`, so they merge locally even without a server |

---

## 4. Comments (User D)

Comments anchored by **index** break the moment someone types above them.
**Decision:** anchors are *relative positions* — the ID of the character they're
attached to. IDs never move, so the anchor follows the text. If the whole anchored
range is deleted, the anchor still resolves (tombstones), and the UI marks the comment
as *detached* instead of silently pointing at the wrong words.

The same technique is used for **remote cursors and selections**, and for your own
caret when remote edits arrive (otherwise your cursor jumps every time someone types
above you).

---

## 5. Version restore (User E) — the trap

The obvious implementation — "replace the document with the snapshot" — is wrong in
three ways:

1. It erases everything A, B, C and D did concurrently with the restore.
2. Replicas that already have newer ops will re-apply them on top → chaos.
3. Ops in flight reference characters that the "restored" state no longer contains.

**Decision:** a restore is a *new forward operation*. A version is just a state vector
(plus a JSON snapshot of whiteboard state). To restore:

* characters visible now but not at that version → deleted,
* characters visible then but deleted now → re-inserted as *new* characters anchored
  right after their own tombstones (so they come back in exactly the right place),
* everyone's concurrent edits merge normally, and the restore itself can be undone.

Because a version is a state vector, *time-travel preview* is free: a character is
visible at version `v` iff its ID is inside `v` and no delete inside `v` targets it.

---

## 6. Undo in a multiplayer document

Native textarea undo replays *the textarea's* history — which now includes other
people's edits. Pressing ⌘Z would undo your colleague's sentence. **Decision:** a
local undo manager that only undoes **your own** operations, expressed as new CRDT ops
(delete your inserted chars / re-insert your deleted chars at their tombstones).

---

## 7. Whiteboard

| Problem | Decision |
|--------|----------|
| Two users move the same shape | Per-field Last-Writer-Wins register, ordered by **Lamport clock** + clientId. Never wall-clock time — laptops' clocks lie |
| A moves while B deletes | `deleted` is just another LWW field → delete wins over older moves, consistently on every replica |
| Dragging floods the network | Throttle to ~30 ms; overwritten updates compact to `gc` stubs |
| Freehand drawing | Points are buffered locally, committed as one shape |
| Z-order conflicts | `z` is an LWW field; ties broken by shape ID |

---

## 8. Server, scale and trust

### 8.1 The server is a replica, not a judge
It applies ops to its own CRDT copy (so it can serve diffs and snapshots), persists
them, and relays them. It never rejects an op for "conflicting" — conflicts don't exist.

### 8.2 Horizontal scaling
Users in the same room may land on different WebSocket servers. **Decision:** servers
publish ops to a Redis channel per room; every server holding that room applies them.
Because ops are idempotent and commutative, there is no need for sticky sessions,
leader election, or ordering guarantees from Redis. Postgres stores ops with a primary
key of `(doc, client, clock)` and `ON CONFLICT DO NOTHING`, so two servers persisting
the same op is harmless.

**Crash between broadcast and persist?** The op is lost from the database but still
exists on the clients. On their next sync handshake the server's state vector is
behind, so the client re-uploads it. The system self-heals.

**Load-vs-subscribe race:** a server subscribes to the room channel *before* loading
from the database; anything that arrives in between is idempotent.

### 8.3 Malicious or buggy clients
| Attack | Defence |
|--------|---------|
| Viewer sends edits | Role checked per op (`viewer` < `commenter` < `editor` < `owner`); commenters may only write to the comments map |
| Client forges ops under someone else's `clientId` (fake authorship) | Server binds each `clientId` to the first user that used it; ops from a clientId owned by another user are rejected. This is what makes "blame" view trustworthy |
| Huge clock gap to wedge the pending buffer | Pending buffer is bounded; malformed ops rejected by a schema check |
| Flooding | Token-bucket rate limit per socket, max frame size |
| Permission revoked mid-session | Server pushes the new role and downgrades the live connection immediately |

### 8.4 100+ users in one room
* Fan-out is O(users) per op, so ops are relayed in small batches.
* Presence (cursors) is *ephemeral*: never persisted, throttled, dropped first for
  slow consumers (`bufferedAmount` back-pressure), expired by TTL when a socket dies.
* Half-open TCP connections detected by ping/pong heartbeats.
* A load-test script spins up 100 bot clients editing the same document concurrently
  and verifies every one of them converged to the identical text.

---

## 9. What I deliberately did *not* build (and why)

* **End-to-end encryption.** With E2EE the server cannot read ops, so it cannot compute
  diffs, snapshots or enforce per-field permissions. It needs client-side snapshotting
  and key rotation on member removal — a project on its own. Listed in the roadmap.
* **Rich text (ProseMirror).** Mapping a tree-structured schema onto a sequence CRDT
  is significant work orthogonal to the core problem; the editor is a plain-text /
  Markdown editor so the CRDT stays visible and testable.
* **Tombstone GC for text** — see §2.8.

---

## 10. How correctness is proven

1. **Unit tests** for every scenario above (concurrent insert, interleaving, delete
   vs insert, out-of-order, duplicates, restore, comments anchors, undo).
2. **Randomised convergence fuzzing**: N replicas perform random inserts/deletes/
   map writes; ops are delivered in shuffled order, with duplicates, in partitions;
   after full delivery every replica must produce the identical text and map state.
   Thousands of seeds per run, deterministic RNG so any failure is reproducible.
3. **Snapshot equivalence**: encode → decode → same state; state-vector diff sync
   reaches the same state as full-history replay.
4. **End-to-end**: real server + 100 WebSocket bots.
5. **Network Lab** in the UI: three in-browser replicas over a simulated network with
   adjustable latency, packet loss, duplication and partitions — you can watch it
   converge.
