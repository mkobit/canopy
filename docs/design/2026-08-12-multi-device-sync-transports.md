# Multi-device sync transports: folder replication vs. a "connect to Drive" client

> Status: **draft** (design exploration; no code change, no tasks staged)
> Scope: how multi-device eventual sync actually reaches each Canopy deployment (desktop, web, mobile); the folder-replication model vs. an app-owned cloud-sync client; bring-your-own-cloud vs. a server you run
> Type: design proposal
> Depends on: [2026-07-03-event-log-storage-and-sync.md](2026-07-03-event-log-storage-and-sync.md), [2026-02-08-sync.md](2026-02-08-sync.md), [2026-02-08-storage-layer.md](2026-02-08-storage-layer.md), [2026-08-12-crdt-vs-event-log-revisited.md](2026-08-12-crdt-vs-event-log-revisited.md)

---

## 1. Context

Canopy has three `EventLogStore` transports that touch other machines, all shipped under the closed epic `canopy-1q5`:

- **`@canopy/storage-file` folder model** (`canopy-1q5.3`/`.4`): the app writes events to a local directory (`events/<deviceId>/*.jsonl` + manifest); an _external_ filesystem-sync daemon (Google Drive for Desktop, Dropbox, Syncthing) replicates the directory across devices; each device's `reconcile()` reads the other devices' subfolders that the daemon copied in, tracks a per-device watermark, and ingests new events.
- **`@canopy/storage-http`** (`canopy-1q5.2`): a stateless `EventLogStore` over a REST API — `POST /graphs/:id/events` to append, `GET /graphs/:id/events?after=…` to read. It has no background sync loop; it is request/response against a server you run.
- The in-memory / IndexedDB / SQLite backends, which are single-device local persistence.

This document works through a gap the folder model leaves open, raised while thinking about Google Drive specifically: instead of writing to a local directory and letting an external Google Drive daemon replicate the folder, the app itself could be a Drive client — talk to the Drive API, sync bidirectionally, and own the convergence.

The claim developed below: that is a worthwhile _fourth_ transport, its real justification is reach and bring-your-own-cloud rather than a better merge strategy, and it must reuse the existing event-set reconciliation rather than invent a file-level bidirectional merge.

This is a transport-layer design.
It is deliberately independent of the separate, higher-order question of whether Canopy's data model itself is right (being examined against Logseq 2.0 in `docs/research/2026-08-12-logseq-2.0-comparison.md`); nothing here depends on the answer to that.

---

## 2. Decision drivers

1. **Reach.** The transport must work where Canopy actually runs, including the browser (`apps/web`) and, eventually, mobile.
2. **Bring-your-own-cloud.** The original storage-layer doc valued that "users do not need to pay for or maintain sync services" and own their own data. Preserve that.
3. **No new convergence machinery.** Conflict resolution lives in projection (LWW per property, additive edges, tombstones); a transport must stay a dumb event carrier. See the CRDT revisit ([2026-08-12](2026-08-12-crdt-vs-event-log-revisited.md)).
4. **Operational cost to the maintainer.** Prefer transports that require no server for the Canopy author to run, host, or pay for.
5. **Dependency and failure-surface weight.** OAuth, rate limits, and token lifecycle are real costs; weigh them honestly.

---

## 3. The invariant that keeps every transport cheap

All of this rests on one property the shipped design already has, and any new transport must preserve:

> **Single writer per device stream, plus event-set reconciliation by eventId.**

A device only ever _writes_ its own event stream (its own folder, its own segment files).
Other devices' streams are read-only inputs.
Two devices therefore never write the same file or the same log position — **file-level or record-level write conflicts are structurally impossible**, on a disk or in a cloud bucket.

Given that, "sync" is never a merge.
It is: push my new events up, pull other devices' new events down, deduplicate by eventId, project.
Event-level convergence (two devices set the same property) is resolved later, in projection, by last-writer-wins on eventId — not in the transport.

This is the single most important thing to get right in any Drive work, because it is what makes the transport dumb.
It is examined again in §6 because the tempting phrasing "sync a local file bidirectionally with a convergence strategy" quietly violates it.

---

## 4. Two shapes of "Google Drive sync"

### 4.1 Model A — dumb replicated folder (shipped)

The app writes a local directory; an external daemon replicates it.
The app never knows Drive exists; it only touches the filesystem.

Strengths: zero sync code, provider-agnostic (Drive, Dropbox, Syncthing, iCloud, a NAS — anything that replicates a folder), and the elegant single-writer-per-folder property makes file conflicts impossible.

Hard limits:

- **It cannot work in the browser or on mobile.** There is no local replicated folder for a desktop daemon to sync. `apps/web` is IndexedDB-only today — effectively single-device.
- **It depends on a fragile, invisible external daemon.** The user must install Google Drive for Desktop, keep it running and logged in, and point it at exactly the right folder. The failure modes (paused sync, conflict-copy files, partial-file states) are outside the app's control and outside its ability to report.

### 4.2 Model B — app-owned "connect to Drive" client (proposed)

The app is itself a Drive API client: OAuth to the user's Drive, upload its own event segments, list and download other devices' segments, and reconcile — the same push/pull/dedup/project loop, but over the Drive REST API instead of a replicated local directory.

This is a new `EventLogStore` backend — call it `@canopy/storage-drive` — that is a **sibling of `storage-http`, not a rework of `storage-file`**.
It is closer to `storage-http` (the remote is a network API) than to `storage-file` (the remote is a local directory), but it needs `storage-file`'s _format and reconcile semantics_ (per-device segments, manifests, watermarks) because, unlike `storage-http`, no server is doing dedup or ordering for it — Drive is dumb object storage.

So `storage-drive` = `storage-file`'s reconciliation model + `storage-http`'s "the remote is a network you call" shape.

---

## 5. Why Model B is worth building — and the honest reason

Model B's real value is **not** a better convergence strategy (§6 shows it needs none).
It is two things Model A cannot give:

- **Reach.** It is the only way multi-device sync reaches the web app and mobile, where there is no local folder to replicate. Without it, `apps/web` stays single-device unless you run a server.
- **Bring-your-own-cloud that also reaches the web.** Compared to `storage-http`, Drive-API sync keeps the "user owns their data, the maintainer runs no server" property (driver 2, 4) _while_ reaching the browser (driver 1). `storage-http` reaches the browser but requires a server the maintainer hosts and pays for. That combination — no server _and_ works in a browser — is the niche `storage-drive` uniquely fills.

Model A does not become wrong; it stays the zero-cost, provider-agnostic desktop option.
Model B is what you add when you want Drive sync without asking the user to install a desktop daemon, or when the client is a browser.

---

## 6. The trap: do not build a file-level bidirectional merge

The framing that prompted this — "sync a local file bidirectionally with some convergence strategy" — is a trap in two words: _a_ (singular) file, and _convergence strategy_ (implying merge).

Both quietly discard the §3 invariant and re-import a hard problem:

- **Do not collapse to one shared file.** A single shared log on Drive that every device appends to is the multi-writer-same-file conflict that per-device folders exist to eliminate. Keep per-device segment files. Two devices must never write the same Drive object.
- **Do not write a byte-level or file-level merge.** That is the rsync / Dropbox "conflicted copy" problem, and it is genuinely hard. You do not need it. With single-writer-per-device files, no two devices ever produce conflicting versions of the same object, so "bidirectional sync" is just: upload my new/updated segments, download theirs, dedup by eventId, project. Event-level convergence is already handled by projection's LWW.

Restated: the convergence strategy already exists and lives in the kernel.
`storage-drive` inherits it for free by keeping the single-writer invariant.
Its job is moving segment files to and from Drive, nothing more.

---

## 7. What is genuinely new (and what is reused)

Reused, unchanged:

- The event-log data model and projection-layer convergence (the kernel).
- `storage-file`'s on-disk format: per-device JSONL segments, sealed-immutable segments named by first eventId, manifests with per-device watermarks, batches never spanning a segment.
- The reconcile shape: scan remote device streams, read past each watermark, dedup by eventId, append locally, project.

Genuinely new, and all of it _transport_ work rather than _data-model_ work:

- **OAuth and token lifecycle** against the user's Drive.
- **Incremental change detection.** Do not re-list the whole Drive folder each poll; use Drive's `changes.list` / `startPageToken` (or per-file `modifiedTime`/`headRevisionId`) to find only what moved.
- **Rate limiting and backoff.** Drive quotas are real; batch uploads and respect 429/backoff.
- **Upload atomicity.** Don't leave a half-written segment visible to other devices. The existing "sealed segments are immutable; the active segment is rewritten whole on flush" rule already gives most of this — a sealed segment is written once and never mutated, so a completed upload is all-or-nothing at the object level. Use resumable uploads and only advance the manifest/watermark after the segment object is fully committed.
- **An offline write queue.** The local event log stays the source of truth and always accepts writes; the Drive client drains a queue when connectivity returns. This is the offline-first model the sync doc already specifies, made explicit for a network transport.

None of the new work touches convergence semantics or the kernel.
`storage-drive` slots behind `GraphSession` exactly like the other four backends, with zero kernel changes.

---

## 8. The fork this actually depends on

The one decision that gates the shape of everything above:

> Is the intended multi-device story for web/mobile **bring-your-own-cloud** (`storage-drive`, `storage-icloud`, etc.), or **a server the maintainer runs** (`storage-http` plus a backend)?

They are not exclusive, but they imply very different next steps:

- **BYO-cloud** (`storage-drive`): no server to run; per-provider clients (Drive first, then others); OAuth and provider quirks are the cost; best fit for the "personal, user-owns-data" ethos.
- **Server-you-run** (`storage-http` + backend): one transport for every client; you control dedup, ordering, and (later) real-time push; you host, secure, and pay for it. This is also the natural home if real-time collaboration ever becomes a goal, because a server is where a push transport would live.

Recommendation: treat `storage-drive` as the **preferred BYO-cloud path for reaching the web app without running a server**, and keep `storage-http` as the option for when a hosted backend is wanted anyway (teams, real-time, server-side search).
Decide the fork before implementing either further; do not build both speculatively.

---

## 9. Relationship to the CRDT decision (unchanged)

`storage-drive` does not reopen the CRDT question.
It is still eventual event-set reconciliation with dedup-by-eventId and projection LWW.
Drive is polling/eventual, not a real-time push transport, so it does not meet trigger signal #1 in the CRDT revisit ([§8.1](2026-08-12-crdt-vs-event-log-revisited.md)) and does not create the multi-writer-same-block scenario that is the only tip-back condition.
It is precisely the kind of backend that document says the event-log model absorbs cheaply.

---

## 10. Recommendation and open questions

**Recommendation.** Build `@canopy/storage-drive` as a fourth network transport when multi-device sync for the web app is prioritized, sibling to `storage-http`, reusing `storage-file`'s format and reconcile semantics behind the single-writer invariant.
It is new scope beyond the closed `canopy-1q5.4` (which was the folder model), so it warrants its own bead and, before any tasks, its own OpenSpec change with the mandatory adversarial review (OAuth, quota, partial-upload, and revoked-token failure modes are exactly what that review exists to force).
Do not design the sync engine further until the §8 fork is decided and the work is actually prioritized.

**Open questions:**

1. The §8 fork: BYO-cloud vs. server-you-run as the primary web/mobile story.
2. Where the Drive client runs for the browser: the web app's own tab (Drive JS SDK, CORS, token in the browser) vs. a companion process (like `apps/clip-host`/`apps/daemon`) that owns the Drive credentials and exposes an `EventLogStore` over IPC. The daemon route keeps OAuth secrets out of the browser and mirrors the existing clip-host pattern.
3. Whether `storage-drive` generalizes to a `storage-cloud` port with per-provider adapters (Drive, Dropbox, iCloud, S3) or stays Drive-specific until a second provider is real (per "constrain speculative design," Drive-only first).
4. End-to-end encryption of segments before upload — untrusted-transport concern carried over unresolved from the sync doc (§8), and more pressing when the app hands data to a third-party cloud than when a local daemon did.
5. New-device bootstrap cost: downloading a mature vault's full log from Drive on first sync — the snapshot/fast-start question (storage doc §4), still deferred but sharper over a metered network.

---

## 11. Consequences

- No code changes from this doc; it captures the transport landscape and the fork so they are not re-derived.
- `docs/architecture/bounded-contexts.md` still says "six packages" and omits `storage-file`/`storage-http`; correcting it (and adding `storage-drive` when built) is the same documentation-debt follow-up flagged by the CRDT revisit.
- The single-writer-per-device invariant (§3) is load-bearing for every transport, shipped and future; a future change that introduces a shared writable stream would break the "dumb transport" property and should be rejected on that basis.
