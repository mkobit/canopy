# Dolt Git remote replication and repository hygiene

## Scope and evidence

This report describes the Git-backed Dolt remote implementation in the Dolt dependency pinned by installed Beads source revision [`c1c4b642ac1c08d8c828007a1c2f96e47e43ef7c`](https://github.com/gastownhall/beads/tree/c1c4b642ac1c08d8c828007a1c2f96e47e43ef7c).

That Beads revision's `go.mod` pins `github.com/dolthub/dolt/go` at `v0.40.5-0.20260806213044-796d07497741`, resolving to Dolt commit [`796d074977417da931df65202a79e0a7f532a3db`](https://github.com/dolthub/dolt/tree/796d074977417da931df65202a79e0a7f532a3db).

The pinned module source was downloaded under `node_modules/.cache/h59/gomodcache/` and inspected directly.

The installed environment reports Beads `1.3.1`, Bun `1.4.3`, and Git `2.53.0`, and it has no `dolt` executable.

This investigation did not run Dolt itself or the upstream Go tests.

A disposable local Git reproduction verified that Git can push a namespaced ref such as `refs/dolt/data` to a bare repository.

That reproduction did not exercise Dolt serialization, Dolt synchronization, SSH, or GitHub.

The findings below describe the pinned Dolt implementation and distinguish them from local observations and recommendations.

## What a `git+ssh://` remote means

Dolt recognizes `git+file`, `git+http`, `git+https`, and `git+ssh` as Git-backed remote schemes.

Dolt normalizes an SSH URL such as `git@github.com:org/repo.git` to `git+ssh://git@github.com/./org/repo.git` in [`git_remote_url.go`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/libraries/doltcore/env/git_remote_url.go#L20-L92).

The `git+` prefix selects Dolt's Git remote factory, and the underlying Git operations use the Git binary on `PATH`, as shown by [`runner.go`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/internal/git/runner.go#L34-L59).

SSH keys, host-key checks, server permissions, and Git server behavior therefore follow the configured Git and SSH environment.

This is Git transport for Dolt's storage representation, not a Git clone of an editable SQL source tree.

## Data representation and ref namespaces

The Git blobstore stores key/value objects as paths in the tree of a Git commit referenced by a Git ref.

Dolt's default database data ref is the full Git ref `refs/dolt/data`, named in [`git_refs.go`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_refs.go#L20-L32).

The commit tree contains Dolt storage objects, including content-addressed table data and a manifest that describes the table set.

Dolt accesses those values through its blobstore rather than treating them as human-authored source files.

The Git commit history for this ref is an implementation detail used for transfer deltas and retention.

Dolt data identity and table semantics remain defined by Dolt's storage formats.

`refs/dolt/data` is a Git ref name used by Dolt to address its database data tree.

Dolt refs such as `main` and `feature-x` are names inside the database's version-control model, backed by Dolt metadata and not interchangeable with arbitrary Git branch refs.

The Git remote carries the backing storage tree, so a Git host can show Dolt support refs that are not user-facing Dolt branches.

## `__dolt_remote_info__` metadata branch

Dolt defaults the info branch name to `__dolt_remote_info__`.

`DOLT_REMOTE_INFO_BRANCH` can override its name or disable it with an empty value, as shown in [`git_refs.go`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_refs.go#L20-L41) and [`git_remote.go`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/libraries/doltcore/dbfactory/git_remote.go#L190-L210).

After a successful data push, Dolt best-effort force-pushes a separate visible Git branch containing one `DOLT_REMOTE.md` file with the backing ref, current data commit ID, and update timestamp.

This info branch is descriptive metadata for recognizing and inspecting a Dolt remote.

It is not the database data ref and does not contain the database's user tables.

The implementation ignores failures while updating the info branch, so a metadata update failure does not fail the database write; see [`pushInfoBranch`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_blobstore.go#L824-L871).

Each update replaces the info branch tip, so it is not an audit history.

## Write, fetch, and synchronization lifecycle

For a remote-managed write, Dolt fetches the configured data ref, aligns its UUID-owned local ref to the fetched head, and merges the fetched tree into its cache.

Dolt builds a new Git tree and commit on that head, then pushes with a lease tied to the fetched head so a concurrent remote update is detected instead of silently overwritten.

The writer retries remote races with bounded backoff; the path is implemented in [`remoteManagedWrite`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_blobstore.go#L874-L925).

A missing remote data ref is treated as an empty store for reads and first writes.

The remote factory separately rejects a repository with no advertised branch before opening it; see [`ensureRemoteHasBranches`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/libraries/doltcore/dbfactory/git_remote.go#L224-L232).

Other fetch errors are returned; see [`syncForRead` and `fetchAlignAndMergeForWrite`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_blobstore.go#L735-L802).

Reads of a non-manifest content-addressed key already present in the local object cache can return from that cache without fetching.

The mutable `manifest` key always requires read synchronization, as do uncached content-addressed keys.

If a required fetch fails, the read returns that fetch error instead of treating stale or absent cache state as a general fallback.

Successful read syncs are reused for a default one-second interval.

Read synchronization also skips its fetch while a write is in progress.

Writes always fetch before writing.

This revision gives each blobstore instance UUID-owned local and remote-tracking refs.

It does not use the shared fetch anchor present in newer source.

`dolt fetch` and `dolt pull` are SQL database version-control commands.

`pull` is a fetch followed by a Dolt merge of a remote Dolt branch, as described in [`pull.go`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/cmd/dolt/commands/pull.go#L34-L55).

They should not be confused with invoking `git fetch` or `git pull` on the host repository, which manipulates Git refs directly and does not perform a Dolt branch merge.

Canopy's `.beads/config.yaml` sets `sync.remote` to `git+ssh://git@github.com/mkobit/canopy.git`, while `.beads/metadata.json` records an embedded Dolt database named `canopy`.

Those local settings establish the configured endpoint and database mode, but do not prove that a network push succeeded or that GitHub currently accepts writes.

## Cleanup, garbage collection, and limits

There are separate cleanup layers: Dolt removes obsolete storage tree entries during manifest writes, Dolt bounds the data ref's commit ancestry, and Git garbage collection repacks unreachable local Git objects.

When Dolt knows the new manifest's table set, it removes table paths no longer referenced from the new tree.

Those paths are then absent from the current data snapshot.

By default, a write that prunes tree entries creates a parentless Git commit, making prior trees unreachable from `refs/dolt/data` and eligible for later Git object cleanup.

The installed dependency has no configurable `git-remote.max-history-commits` option.

Its blobstore uses a fixed limit of 64 consecutive parented commits, then creates a parentless commit.

A commit is also made parentless when entries are pruned; see [`buildCommitForKeyWrite`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_blobstore.go#L1312-L1388).

If Git cannot count the existing ancestry, this code also leaves the new commit parentless because it cannot establish that the chain is below the limit.

These rules bound reachable ancestry but do not mean a Git server immediately deletes unreachable objects.

On local cache teardown, the implementation may run `git gc --prune=now` at most once per 24 hours, using a filesystem lock.

GC errors are ignored because this is an optimization; see [`Teardown` and `maybeRunGC`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_blobstore.go#L652-L729).

That local cache operation does not run Git maintenance on GitHub or another remote server.

The server host controls physical reclamation of unreachable objects, and source review cannot establish a hosted provider's retention timing.

The source creates per-instance UUID-owned local refs and fetch-tracking refs to isolate concurrent operations.

`Teardown` attempts to delete both refs and returns ref-deletion errors.

The optional `CleanupOwnedLocalRef` API deletes only the local ref, while instances that are not torn down can leave refs in the local cache; see [`git_refs.go`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_refs.go#L45-L62) and [`git_blobstore.go`](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_blobstore.go#L632-L685).

A failed required fetch, authentication failure, permission denial, lease race, server policy, or outage can prevent synchronization.

A cached non-manifest key, a recent successful sync, or an in-progress write can avoid a fetch.

When a fetch is required, its failure is returned to the caller.

The metadata branch update is best effort, while failed data-ref fetches and pushes fail the relevant database operation.

Git host branch deletion, custom-ref policy, retention, and SSH authorization are provider-specific and were not tested against GitHub.

## Repository hygiene and branch protection expectations

**Recommendation:** treat a repository used as a Dolt remote as storage infrastructure, and do not mix human-authored Git commits into `refs/dolt/data`.

**Recommendation:** retain the Dolt data ref and let Dolt own its content and update protocol.

Do not manually reset, delete, force-update, or merge that ref with Git commands.

**Recommendation:** ensure the server permits the Dolt client to update `refs/dolt/data`, which is a custom ref outside `refs/heads/`.

Ordinary branch protection rules govern branch refs such as `refs/heads/__dolt_remote_info__`.

Those rules do not by themselves establish policy for `refs/dolt/data`.

Where a server offers custom-ref or namespace policies, verify those rules separately for `refs/dolt/data`.

Dolt may intentionally sever data-ref commit ancestry during pruning or history trimming, so a non-fast-forward update can be part of the storage protocol.

A branch protection rule that requires pull requests, signed commits, status checks, restricted push actors, or forbids force pushes may block updates to the metadata branch if the rule applies there.

The metadata branch is rewritten on successful data writes, so check whether its applicable branch rules allow the Dolt writer to force-update it.

**Recommendation:** keep a normal human source repository separate from the Dolt data remote where possible, or scope its branch rules so they do not reject Dolt-managed branches.

Use provider-supported backups and access controls, and test maintenance policies against a disposable remote before applying them to a real database.

Do not use generic `git gc` as a substitute for Dolt manifest-aware cleanup.

Do not run destructive Git maintenance against a live Dolt remote without Dolt's documented maintenance protocol.

## Safe local observation

A disposable bare Git repository accepted a push of `refs/dolt/data`, and `git show-ref` reported that namespaced ref in the bare repository.

This confirms ordinary Git ref transport only.

Without the Dolt executable, it cannot validate Dolt database creation, `dolt push`, info-branch generation, Dolt GC, SSH, or remote behavior.

The disposable Git repository and client are under `node_modules/.cache/h59/local-repro/` and can be removed without touching repository data.

## Primary sources

- [Beads installed source revision](https://github.com/gastownhall/beads/tree/c1c4b642ac1c08d8c828007a1c2f96e47e43ef7c)
- [Beads pinned `go.mod`](https://github.com/gastownhall/beads/blob/c1c4b642ac1c08d8c828007a1c2f96e47e43ef7c/go.mod)
- [Dolt dependency at verified commit `796d074977417da931df65202a79e0a7f532a3db`](https://github.com/dolthub/dolt/tree/796d074977417da931df65202a79e0a7f532a3db)
- [Dolt Git URL normalization](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/libraries/doltcore/env/git_remote_url.go)
- [Dolt Git remote factory and options](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/libraries/doltcore/dbfactory/git_remote.go)
- [Dolt Git blobstore implementation](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_blobstore.go)
- [Dolt ref names and info branch configuration](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/git_refs.go)
- [Dolt Git command runner](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/store/blobstore/internal/git/runner.go)
- [Dolt pull semantics](https://github.com/dolthub/dolt/blob/796d074977417da931df65202a79e0a7f532a3db/go/cmd/dolt/commands/pull.go)
- [Git documentation for push refspecs](https://git-scm.com/docs/git-push)
