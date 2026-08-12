# Logseq 2.0 sync mechanism: primary-source verification

> Type: research / source verification
> Date: 2026-08-12
> Status: frozen snapshot
> Purpose: settle from primary sources whether Logseq 2.0 (DB version) syncs graph data with a CRDT, an operation-log plus server-authoritative rebase, or operational transform, and record what that does to Canopy's axis-C conclusion

---

## The question and why it matters

The prior comparison doc [2026-08-12-logseq-2.0-comparison.md](2026-08-12-logseq-2.0-comparison.md) asserts in axis C that Logseq's DB version does **not** use a CRDT for graph data — it uses a `client_ops` operation log plus server-mediated rebase over WebSocket.
That claim is load-bearing: the CRDT-vs-event-log ADR (PR #446) treats Logseq as the "hardest case" corroborating evidence, reasoning that a team which shipped real-time multi-user collaboration and still declined a CRDT strengthens Canopy's own no-CRDT decision.
But the axis-C claim rested entirely on [DeepWiki](https://deepwiki.com/logseq/logseq), a machine-generated secondary reading of the ClojureScript source, and was flagged inline as inference; the maintainer suspected Logseq actually uses a CRDT.
This doc goes to the ClojureScript source and the Logseq team's own protocol documentation to replace that inference with primary evidence.

## Method and sources examined

All source was read from the `logseq/logseq` GitHub repository at commit `d3d6afa37b646dda90928c2a5f8a1e27dbcc5814` (`master`, authored 2026-08-12), fetched via the GitHub contents API and decoded, not through DeepWiki.
Method:

- read both dependency manifests (`deps.edn`, `package.json`) and grepped for every common CRDT library
- ran a GitHub code search for `crdt` across the whole repository
- located the sync implementation (`src/main/frontend/worker/sync/*`) and read the op-log store, the tx-apply/rebase engine, and the snapshot upload path
- read the two maintainer-authored design docs the server package points to: `docs/agent-guide/db-sync/db-sync-guide.md` and `docs/agent-guide/db-sync/protocol.md`
- read the server package README (`deps/db-sync/README.md`) and the reviewer rules module (`.agents/skills/logseq-review-workflow/rules/modules/db-sync.md`)

Primary sources are the repo source and the team-authored docs in the repo.
Secondary sources (DeepWiki, third-party blogs) are used only to cross-check, and are labelled as such.

## Evidence

### Primary: no CRDT library is a dependency, and `crdt` appears nowhere in the tree

`deps.edn` (ClojureScript deps) contains a Logseq fork of [DataScript](https://github.com/logseq/datascript) and [Malli](https://github.com/metosin/malli), but none of `automerge`, `yjs`, `y-crdt`, `y-protocols`, `diamond-types`, `loro`, or `datahike`.
Source: [deps.edn](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/deps.edn).

`package.json` (JS deps) contains `comlink` (worker RPC) and `ws` (WebSocket), but none of `automerge`, `yjs`, `y-crdt`, `y-protocols`, `crdt`, `diamond-types`, or `loro`.
Source: [package.json](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/package.json).

A GitHub code search for `crdt` scoped to `repo:logseq/logseq` returns zero matches.
A CRDT backbone essentially always means a CRDT library plus CRDT vocabulary in the code; both are absent.

### Primary: local edits are persisted as a discrete operation log in SQLite

The client sync store is `frontend.worker.sync.client-op`, whose namespace docstring is:

> Store client sync metadata and ops in sqlite tables. DataScript client-op storage is deprecated and unsupported.

It creates a `client_ops` table whose columns are per-operation records, not CRDT state:

```
create table if not exists client_ops (
  id integer primary key autoincrement,
  kind text not null,
  created_at integer not null,
  tx_id text unique,
  pending integer not null default 0,
  failed integer not null default 0,
  outliner_op text,
  ...
  forward_outliner_ops text,
  inverse_outliner_ops text,
  ...
  normalized_tx_data text,
  reversed_tx_data text,
  ...
)
```

Source: [worker/sync/client_op.cljs](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/src/main/frontend/worker/sync/client_op.cljs).
The presence of both `forward_outliner_ops` and `inverse_outliner_ops` (and `normalized_tx_data` / `reversed_tx_data`) is the fingerprint of an op-log designed for reverse-and-replay rebasing, not of a CRDT's merge state.

### Primary: the wire protocol is server-authoritative ordering with stale-rejection

The Logseq-team-authored [protocol.md](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/docs/agent-guide/db-sync/protocol.md) specifies a WebSocket to `/sync/:graph-id` carrying JSON messages whose `tx` payloads are Transit strings.
The salient messages:

- client uploads `{"type":"tx/batch","t-before":<t>,"txs":[...]}` — a batch of ops based on the `t` the client last saw
- server replies `{"type":"tx/batch/ok","t":<t>,"checksum":"<hex>"}` — the server assigns the new monotonic `t` and returns a post-apply entity checksum
- server can reply `{"type":"tx/reject","reason":"stale","t":<t>}` — "Client tx is based on stale t"
- clients read history with `{"type":"pull","since":<t>}` and receive `pull/ok` with server-assigned per-tx `t` values
- `{"type":"changed","t":<t>}` is broadcast after a batch advances server state, telling other clients to pull

A single monotonic server-assigned `t`, plus explicit rejection of batches based on a stale `t`, is server-authoritative serialization.
It is the opposite of a CRDT's premise that concurrent operations commute and merge without a central ordering authority.

### Primary: conflict resolution is reverse-apply-rebase, with divergences recorded not merged

The tx-apply engine `frontend.worker.sync.apply-txs` is built around rebasing, with a source comment "still pull/rebase remote txs" and a declared function set including `reverse-local-txs!`, `apply-remote-txs!`, `rebase-local-txs!`, and `repair-applied-txs!`.
Source: [worker/sync/apply_txs.cljs](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/src/main/frontend/worker/sync/apply_txs.cljs).
When the server rejects a local batch as stale, the client reverses its rejected-and-later pending txs, applies the authoritative remote txs, then replays (rebases) the local ops on top:

```clojure
(reverse-local-txs! conn rejected-and-after)
(reset! *rebase-results
        (rebase-local-txs! repo conn rebase-txs rebase-db-before))
```

Local ops that cannot cleanly replay against the new base throw `invalid-rebase-op!` and are treated as stale, not transformed.
Same-attribute divergence is handled by recording, not lattice merge: `sync-conflict-attrs` is `#{:block/title}`, and `remote-sync-conflicts` compares the block's current value against the incoming remote value and, when they differ for a block the user also edited locally, writes the losing value into a `sync_conflicts` SQLite table and broadcasts `:sync-conflicts-updated` to surface it.
The remote (server-ordered) value is what stays applied; this is last-writer/server-wins with the loser preserved and surfaced, not a CRDT merge and not an operational transform.

### Primary: the server is a central per-graph authority, not a peer

The server package is a Cloudflare Worker using Durable Objects and D1, with a self-hostable Node adapter, and its per-graph Durable Object is the serialization point that assigns `t`.
Sources: [deps/db-sync/README.md](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/deps/db-sync/README.md), [db-sync-guide.md](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/docs/agent-guide/db-sync/db-sync-guide.md).
The reviewer rules module states conflict handling "should be deterministic and observable" and asks "Are retries idempotent?", framing sync as ordered-and-idempotent application, which is an op-log/rebase concern rather than a CRDT one.
Source: [.agents/.../db-sync.md](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/.agents/skills/logseq-review-workflow/rules/modules/db-sync.md).

### Secondary cross-check

DeepWiki's reading described exactly this shape — a `client_ops` op log, `apply-remote-txs!`, server rebase, checksum per transaction, and a full-graph-pull fallback — and the primary source confirms the mechanism, though the actual paths are `worker/sync/*` (DeepWiki cited them under an unrelated page slug, `4.1-layout-and-theming`).
Source: [DeepWiki: DB worker and RTC](https://deepwiki.com/logseq/logseq/4.1-layout-and-theming).
No official Logseq blog post or forum statement was found that names the mechanism "CRDT" or "not CRDT"; the authoritative naming here comes from the team-authored protocol and guide docs inside the repo, which describe ordering-and-rebase without any CRDT concept.

### Official: Logseq brands RTC "CRDT-inspired", and real CRDT merge is a future roadmap item

This is why the question is so easy to answer wrong, and worth recording separately from the source dive.
Logseq's own materials describe RTC as "CRDT-inspired" and market it as real-time collaboration "like Google Docs", which invites the assumption that a CRDT is under the hood ([db-version.md](https://github.com/logseq/docs/blob/master/db-version.md)).
But Logseq's public roadmap places actual CRDT conflict resolution in the unshipped future, not the present: "Use CRDT to resolve block content conflicts automatically" appears under Research, and "Present conflicts when multiple clients editing the same block's content" is a not-yet-shipped Features item ([Logseq roadmap](https://logseq.io/p/NX4mc_ggEV)).
So even by Logseq's own stated plan, a CRDT is an aspiration for automatic block-content merge layered on top of the shipping op-log/rebase sync — not the mechanism that ships today, and the one place a CRDT would do genuine lattice merge (concurrent edits to the same block's text) is explicitly still unbuilt.
The "CRDT-inspired" label is marketing over an op-log-plus-ordering core; it is the likely source of the impression that Logseq "uses a CRDT".

## Verdict

(b) operation log plus server-authoritative rebase, with per-attribute last-writer/server-wins and conflict surfacing — **confidence: high**.
Logseq 2.0 does not use a CRDT for graph data, and does not use operational transform.
The evidence is convergent and primary: no CRDT library in either manifest, zero `crdt` matches in the tree, a discrete `client_ops` SQLite operation log with forward/inverse ops, a wire protocol with a single monotonic server-assigned `t` and explicit stale-batch rejection, a client engine that reverses-applies-rebases local ops against server-ordered remote txs, and a `sync_conflicts` table that records rather than merges divergent values.
The only thing not available from public sources is a prose statement from Logseq calling their design "not a CRDT" in as many words; that gap does not lower confidence, because the mechanism itself is fully visible in team-authored code and protocol docs and is unambiguously ordering-and-rebase.

## Impact on Canopy's conclusion

This **confirms** the axis-C claim in [2026-08-12-logseq-2.0-comparison.md](2026-08-12-logseq-2.0-comparison.md) and strengthens the CRDT-vs-event-log ADR (PR #446).
The DeepWiki inference the axis-C section rested on can now be replaced with primary evidence: the repo source at commit `d3d6afa` and the Logseq-team-authored `protocol.md` / `db-sync-guide.md`.
Two independent teams building conflict resolution over structured graph data both chose op-log-plus-ordering over a CRDT backbone — and Logseq made that choice while building the harder, real-time, multi-writer collaboration case — so the ADR's "hardest case" supporting argument holds and is now on firmer footing.

One honest refinement for the maintainer, not a contradiction:

- Logseq's model is server-authoritative (a central Durable Object assigns the total order), which is a genuinely different and simpler convergence story than Canopy's serverless, decentralized file-folder reconciliation; the corroboration is "op-log-plus-ordering beats a CRDT", not "Canopy and Logseq sync the same way"
- Logseq does resolve same-text-field races by server-wins-plus-surfaced-conflict on `:block/title`, which is close in spirit to Canopy's per-property LWW with the loser kept in history; if Canopy ever needs character-level merge of one text property, this is not a counter-example to Option C (a per-property `crdt-text` strategy) from PR #446

No edits were made to the comparison doc or the ADR; per the task this finding is flagged for the maintainer to fold in.

## Sources

Primary (repo source and Logseq-team-authored docs, all at commit `d3d6afa37b646dda90928c2a5f8a1e27dbcc5814`):

- [deps.edn](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/deps.edn)
- [package.json](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/package.json)
- [src/main/frontend/worker/sync.cljs](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/src/main/frontend/worker/sync.cljs)
- [src/main/frontend/worker/sync/client_op.cljs](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/src/main/frontend/worker/sync/client_op.cljs)
- [src/main/frontend/worker/sync/apply_txs.cljs](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/src/main/frontend/worker/sync/apply_txs.cljs)
- [src/main/frontend/worker/sync/upload.cljs](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/src/main/frontend/worker/sync/upload.cljs)
- [docs/agent-guide/db-sync/protocol.md](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/docs/agent-guide/db-sync/protocol.md)
- [docs/agent-guide/db-sync/db-sync-guide.md](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/docs/agent-guide/db-sync/db-sync-guide.md)
- [deps/db-sync/README.md](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/deps/db-sync/README.md)
- [.agents/skills/logseq-review-workflow/rules/modules/db-sync.md](https://github.com/logseq/logseq/blob/d3d6afa37b646dda90928c2a5f8a1e27dbcc5814/.agents/skills/logseq-review-workflow/rules/modules/db-sync.md)

Secondary (cross-check only):

- [DeepWiki: DB worker and RTC](https://deepwiki.com/logseq/logseq/4.1-layout-and-theming)

Canopy internal:

- [2026-08-12 Logseq 2.0 comparison](2026-08-12-logseq-2.0-comparison.md), axis C
- CRDT-vs-event-log ADR, PR #446
</content>
