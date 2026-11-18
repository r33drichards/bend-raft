# Bend Raft: a checked, executable research prototype

Fixed three-voter Raft core in **Bend 2**, with sequential client model, counter state machine, deterministic host boundary, local checked lemmas, and tests against the actual Bend-generated JavaScript. Not production-ready and not a complete formal verification of Raft.

## Run

Requires Node >=22.18 with TypeScript stripping and Python 3. No npm dependencies.

```sh
git clone https://github.com/bendlang/bend ../raft-bend-upstream
git -C ../raft-bend-upstream checkout 4f99f4c19e1a91fd4c3a9377363d580171d4d40c
node tools/compile.mjs
node --test test/*.mjs
python3 tools/check_election_certificates.py
```

Set `BEND_ROOT` if the checkout is elsewhere. `build/raft.mjs` is the generated ESM module and is included for immediate inspection/use. Regenerate after source changes.

## Implemented

- Voter IDs `0,1,2`, majority two, follower/candidate/leader states.
- Elections, persistent vote/term, log freshness check, duplicate-vote suppression.
- AppendEntries consistency, conflict-only suffix replacement, next/match indexes, retries, current-term quorum commit rule, leader no-op.
- Pure `step(state,event) -> Output{state,sends,replies,reset_timer}`.
- `restart` preserves term/vote/log and rebuilds the application by replay when commitment is learned again.
- Replicated `Add(Nat)` / logged `Read` operations; client success only after commitment and application.
- Client IDs and monotonically increasing sequence numbers with latest-result deduplication. One outstanding operation per client; retries MUST retain the identical operation. Old sequences yield `Stale`, not an old cached result. Client IDs cannot be reused by another client.
- Client model: `client_init`, `client_begin`, `client_request`, `client_reply`.
- Four checked local definitional lemmas preserve term/vote/log on restart and establish the index-zero sentinel.

## Host contract

`host/server.mjs` is a serial, asynchronous JS adapter. Its constructor always treats the supplied state as a boot/recovery image and calls `restart`: saved role, match/next progress, votes and application state are reset, while term/vote/log survive. It cannot attach to a live leader state. It saves full state **durably and atomically before emitting any network message or client response**. A failed storage/effect callback fail-stops the instance. Storage, authenticated transport, peer authorization, randomized election timers, heartbeat timers, ingress validation, serialization, and shutdown belong to the embedding runtime. Events may not execute concurrently for a server. A leader should receive heartbeat events, not election timeouts.

The generated ABI uses tagged objects (`{$:'Request', client:7, seq:1, op:{$:'Add',amount:7}}`), booleans, numbers and linked lists (`{$:'Nil'}` / `{$:'Con',head,tail}`). `host/server.mjs` expects already validated, trusted ADTs, not arbitrary JSON. Runtime tags, field types, IDs, lengths and natural-number bounds need validation in a real wire codec. Inputs and accumulated values must remain in `[0, 2^48-1]`; stop safely before exhaustion. The executable backend is bounded although the mathematical source uses `Nat`.

## Actual WebAssembly client/server ABI

This repository now includes an **experimental callable WASM extension** built on
`r33drichards/bend-wasm` at `24cf4cfbf145d209ec0a1d1523095d1d8612bd32` and the pinned Bend compiler above. This is a local extension, not a feature claimed to exist in upstream bend-wasm. The same compiled module executes both the Bend server and the Bend client model. There is no JS consensus fallback.

```sh
# Install Emscripten SDK 4.0.21 from its official emsdk repository if absent.
# Then, with the pinned Bend and bend-wasm checkouts available:
EMCC=/path/to/emsdk/upstream/emscripten/emcc node tools/build-wasm.mjs
RAFT_WASM_TEST=1 node --test test/*.mjs
node tools/fuzz.mjs 42 100 200 --backend wasm
```

The local SDK default is `../emsdk/upstream/emscripten/emcc`. `BEND_ROOT` and `BEND_WASM_ROOT` override compiler locations. `build/wasm/raft.wasm` and its Emscripten ES-module loader are included; source rebuild regenerates them. Tested here with Node 24.22.1 and Emscripten 4.0.21. WASM tail-call support is required.

```js
import {loadWasm} from './host/wasm.mjs';
const raft = await loadWasm();
let state = raft.init(0);
const output = raft.step(state, {$:'Timeout'});
let client = raft.client_init(7);
client = raft.client_begin(client, {$:'Add', amount:3});
const request = raft.client_request(client); // Some{Request} or None
```

`loadWasm()` exposes `init`, `restart`, `step`, and all four client functions with the same tagged ADTs as the JS backend. Every call serializes all state; no hidden per-server consensus state exists in WASM. Multiple simulated servers/clients share one instance's allocator and code, not consensus state.

### ABI and compiler adaptations

- `tools/wire-schema.mjs` describes a versioned length-delimited natural-number tree codec. `tools/generate-wire.mjs` generates **checked Bend** encoders/decoders. The C shim contains no Raft logic.
- The C ABI uses little-endian uint64 words in linear memory, each in `[0, 2^48-1]`: `raft_call(ptr, word_count)` returns a status; `raft_out_ptr()` / `raft_out_len()` expose a borrowed result until the next call. `malloc/free` manage input buffers. `host/wasm.mjs` copies results before releasing input. Maximum input/output is 1,048,576 words. The raw ABI is for validated trusted values, not hostile wire input; the JS schema encoder validates constructors, primitive types and Nat bounds.
- A derived, temporary compiler copy adds `api_wire` to the backend roots. The pinned upstream checkout is never edited. A fail-closed textual adapter passes two scalar heap/allocator pointers rather than a by-value `Env` through musttail dispatch. Without that change, deep calls corrupted the heap pointer under the tested wasm32 ABI. This is experimental runtime engineering and needs broader backend validation.
- The upstream fixed 512 MiB corpus and 16 MiB evaluation stack remain. Allocation exhaustion and runtime traps stop execution. There are no threads or GPUs.
- This artifact uses Emscripten's Node loader/imports. A general browser/WASI/native-host package is **not** provided; another runtime must supply compatible imports and memory/ownership behavior. The explicit pure state boundary is designed for such adapters.

### Deterministic, coverage-guided simulation

`tools/fuzz.mjs` models delayed/dropped/duplicated/reordered network messages,
partitions, crashes/restarts, randomized event scheduling, elections and client retries using reproducible byte schedules. Both simulated servers and clients run inside actual WASM when `--backend wasm` is selected. Disk durability is modeled as an atomic barrier, not as a real filesystem.

The build uses LLVM `-fsanitize-coverage=trace-pc-guard`. Callbacks and bitmap exports are not instrumented. `coverage()` returns actual WASM-executed C guard hits; `resetCoverage()` clears hits while retaining stable IDs. Coverage spans compiled protocol, codec and runtime branches, **not only Raft source branches**, and is not a percentage of protocol completeness. The fuzz corpus uses these guard IDs plus semantic state/transition features; the JS backend has semantic feedback only. Reproducibility is scoped to the same instrumented binary; allocator/cache branches can add runtime noise across fresh instances or long runs.

The harness checks index bounds, durable single-vote behavior, election safety,
committed prefixes, log matching, independently replayed application/session state,
and response consistency. Failures retain replayable inputs and are minimized.
Finite fuzzing is evidence, not proof. See `docs/wasm-fuzzing.md` for methodology and limitations.

## Evidence and scope

- Bend source typechecks with no holes and no project `@unsafe` definitions.
- 12 JS tests execute the actual emitted Bend: election, replication, logged read, deduplication, stale/self votes, durable vote, delayed AppendEntries, current-term commit, isolation, replay, client retries, host durability ordering/failure, pure main, leader replacement.
- Finite **election-certificate-only** model: 547 states / 2,730 edges, uniqueness PASS. This does not model full Raft and is not a refinement proof.
- Actual WASM differential replay and coverage-guided campaigns: see the recorded test/fuzz evidence.
- `docs/verification.md`: proof assumptions, invariants, useful next obligations and test gaps. No proof of full ElectionSafety, LogMatching, LeaderCompleteness, linearizability, or liveness is claimed.

## Deliberately deferred

Snapshots/compaction, dynamic membership, PreVote, CheckQuorum, ReadIndex, leases, leadership transfer, bounded inflight replication, hardened wire codecs, disk implementation, transport, resource limits, production recovery testing and full refinement proof. An unbounded full log and full suffix sends favor clarity over performance. Preserve a majority's durable state; this is crash-fault Raft, not Byzantine consensus.

## Reading order

1. [Ongaro & Ousterhout, In Search of an Understandable Consensus Algorithm (extended version)](https://raft.github.io/raft.pdf), especially Figure 2 and sections 5/8.
2. [etcd's standalone Raft core](https://github.com/etcd-io/raft), especially deterministic core, storage/Ready ordering, PreVote, CheckQuorum and ReadIndex.
3. [Ongaro's TLA+ model and proof](https://github.com/ongardie/raft.tla), plus [dissertation](https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf).
4. [Bend](https://bend-lang.com/) and [bend-wasm](https://github.com/r33drichards/bend-wasm).
