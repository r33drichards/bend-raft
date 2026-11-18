# Deterministic simulation and actual-Wasm coverage-guided fuzzing

Status: an experimental implementation now exists and actual WASM execution has been exercised. The design discussion below remains a roadmap where explicitly described as proposed. The current `build/wasm/validation.json` and test records are authoritative for completed checks; do not infer that every proposed check or campaign ran. A JavaScript-backend test, generated C file, or Node-wrapper coverage report alone is not WASM execution evidence.

## Implemented now

- `src/wasm.bend` dispatches both server and client operations. `tools/generate-wire.mjs` generates checked Bend codecs from `tools/wire-schema.mjs`; `host/wasm.mjs` invokes actual compiled WASM with no JS consensus fallback.
- `tools/build-wasm.mjs` builds with Emscripten 4.0.21, the pinned Bend compiler and the pinned bend-wasm adapter. A temporary compiler copy retains an extra callable root. A fail-closed runtime patch scalarizes the heap/allocator `Env` argument across musttail dispatch after deep execution exposed aggregate-argument pointer corruption. No upstream checkout is modified.
- `tools/coverage.c` uses LLVM trace-pc-guard callbacks and a resettable bitmap, excluding the callbacks themselves from instrumentation. This measures actual WASM-executed generated C branches, including codecs and runtime, not exclusively Raft source branches.
- `tools/fuzz.mjs` implements reproducible byte schedules, simulated transport faults, partitions, crashes/restarts, two persistence crash points, client retries, independent state-machine replay and protocol invariants. Novel guard IDs plus semantic transitions guide corpus mutation in WASM mode; JS mode has semantic feedback only.
- Failure traces print `REPLAY_JSON`. `--replay FILE` replays exact bytes; `--minimize FILE` performs bounded deterministic action-removal delta debugging preserving the failure signature. The minimizer is implemented; its final validation status is tracked separately from the earlier completed differential run.
- Actual module initialization returned the correct decoded state with 11,740 available coverage guards and 271 guard hits. The simulator worker reported four differential/replay tests passing with zero skips, including actual WASM client/server execution, and a 200-step replay with 3,352 feedback features. Completion of the longer 100-by-200 campaign was not confirmed when these notes were written; it is not recorded as a pass.

## Still not established

No full Raft proof, refinement proof, exhaustive full-protocol model check, real-disk crash test, torn-write recovery, arbitrary hostile raw-ABI parsing, production networking, browser/WASI packaging, or unrestricted compiler/runtime portability is claimed. The runtime owns a fixed 512 MiB corpus; resource bounds matter. Guard IDs are tied to the exact binary, and allocator/runtime branches can introduce feedback noise across instances or histories. See `wasm-abi.md`, the README, and `build/wasm/build.json` for ABI, limitations, version pins and binary/source hashes.

## Proposed minimum viable architecture

```
serialized schedule bytes + versioned seed
               |
      deterministic scheduler
      (network, clock, durability, crashes, clients)
               |
      real Bend-generated Wasm transitions
               |
      state/effects + actual-Wasm coverage bitmap
               |
      independent invariants/history checker
               |
      corpus novelty selection + mutation + shrinking
```

Keep the compiler, Bend source, Wasm bytes, engine flags/version, simulator version, input bytes, and limits pinned in each run record. A seed alone is insufficient across code revisions. Replay the exact schedule bytes as well as supporting seed regeneration. No wall-clock, `Math.random`, unordered asynchronous completions, or ambient process state should affect decisions.

The pure protocol core fits this approach well. A simulated node has distinct volatile state, last successfully persisted state, and at most one pending transition/write under the serial host contract. A step computes output, but its sends/replies remain invisible until persistence completion. A crash discards volatile and pending state and restarts from the durable image. Enumerate crash points before write, after write/before sends, and after subsets of effects. Model write failure without inventing storage guarantees: atomic durable replacement either retains old or new complete state. Torn writes require an actual checksummed/journaled storage adapter, not an assumption that arbitrary corruption is recoverable by basic Raft.

Schedule delivery, drop, duplication, delay, partition, heal, timeout, heartbeat, client retry, crash, restart, and write completion. Deliver authentic messages previously emitted by a node, preserving content and sender. Separate malformed-wire/parser fuzzing from protocol schedules; arbitrarily forging successful replies changes the fault model to Byzantine behavior. Keep deterministic IDs on queued messages so replay/shrinking can resolve dependencies explicitly.

## Runtime input, not recompilation per input

The inspected bend-wasm prototype provides pure-main compilation through C and an Emscripten launcher, not a general exported library interface. It must gain a narrow experimental bridge before efficient runtime fuzzing:

- Preferred interface: fixed-width buffer/length ABI accepting schedule bytes and returning a bounded result or serialized state/effects. A compiled Bend driver calls the real Raft `step`; do not reimplement the algorithm in the C bridge.
- A seed/step-budget ABI is a useful smaller first milestone, but mutating a seed provides worse local mutation and shrinking than mutating a schedule. Keep the RNG/scheduler in the compiled Bend driver or pass decoded events through an actual step ABI.
- Initialize/reset the Bend runtime correctly between inputs. First use a fresh instance/process per trace if allocator/global reset correctness is unknown. Reusing a contaminated heap gives order-dependent results.
- Explicitly export bridge and coverage accessors; do not assume symbols survive dead-code elimination. Emscripten's documented `EXPORTED_FUNCTIONS`, direct calls, and `ccall/cwrap` are the supported linkage mechanisms: https://emscripten.org/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html .
- The prototype's tail-call requirement and large fixed memory allocation must be included in compatibility and worker-concurrency decisions. A bridge must not silently downgrade to executing the JS backend.

## Recommended instrumentation: generated C before Wasm compilation

Clang SanitizerCoverage can insert per-edge guard callbacks using `-fsanitize-coverage=trace-pc-guard`; the user supplies guard initialization and hit callbacks. Give guards stable IDs for the pinned build, record hits in a Wasm-resident bitmap, and expose reset/read accessors. Compile callback code separately without coverage instrumentation to avoid recursion. Reset hit data, not guard IDs, between inputs. A hit bit avoids 8-bit wraparound hiding execution. Scope or label coverage from generated protocol functions separately from generic runtime code so allocation noise does not dominate corpus selection.

Reference: https://clang.llvm.org/docs/SanitizerCoverage.html . This is an engineering proposal, not evidence that the flag already works with the pinned Emscripten/tail-call configuration. Prove that with a tiny conditional program first, then a reachable Raft branch. Inspect the resulting Wasm and demonstrate distinct inputs produce distinct hits from the module. Preserve instrumentation/compiler options in the build manifest.

Alternative: rewrite the Wasm binary and add probes. Wasabi demonstrates binary instrumentation with JavaScript hooks (https://github.com/danleh/wasabi); Fuzzm combines AFL, Wasmtime, binary coverage, and canary instrumentation (https://github.com/fuzzm/fuzzm-project). Neither should be assumed compatible with this prototype's tail calls and Emscripten imports without testing. Compiler-side instrumentation is the shorter path while generated C is available.

Native libFuzzer on generated C is a useful additional target, but not a substitute for actual Wasm execution. Its coverage comes from SanitizerCoverage: https://llvm.org/docs/LibFuzzer.html . Binaryen's `--translate-to-fuzz` / `--fuzz-exec` instead targets compiler/engine behavior by generating and executing Wasm modules; it is not automatically a Raft schedule fuzzer: https://github.com/WebAssembly/binaryen/wiki/Fuzzing .

## Corpus and checking

Start corpus traces with election, partitioned old leader, leader replacement with conflicting uncommitted suffix, duplicate vote replies, reordered append replies, crash after vote persistence, crash after append persistence, and lost client response followed by retry. Mutations include insert/delete/duplicate event, change recipient or delivery selection among existing messages, alter bounded client input, and splice valid schedule segments. Bound trace length, queue size, log length, command magnitudes, and memory/time consumption. Report bound exhaustion separately from a protocol violation.

Retain inputs on new Wasm edge hits plus separate protocol-state features (term change, role transition, rejection reason, commit growth, crash phase). Protocol features are useful semantic feedback but are not machine-code coverage. Record which signal selected each corpus entry. Minimize failures with chunk deletion and parameter shrinking, rerunning the exact failure predicate; malformed replay dependencies need a fixed documented policy, such as no-op or invalid input, not random repair.

After every step check election history uniqueness by term, log matching, committed-prefix consistency, response-to-applied-entry correspondence, and local index bounds. Keep global historical committed/applied facts across simulated crashes: a node forgetting its volatile commit index does not erase safety obligations. Track application results by log prefix, not simply compare all replicas' current counter values while they are at different application indices.

Use the Bend JS backend for differential state/effect comparison on identical events; it can expose backend miscompilation but shares protocol bugs with the source. Add an independent sequential counter/client history checker and targeted invariants. For liveness, add a finite stabilization suffix that heals the network, permits successful persistence, delivers messages fairly, and schedules elections reasonably; timeout without those conditions is not a valid liveness counterexample.

Finally, replay minimized failures on both instrumented and uninstrumented Wasm. Instrumentation can change timing/resource behavior, and a passing finite campaign is not a proof.

## Production-code simulation reference

TigerBeetle's VOPR runs production consensus/storage code with controlled network, clock, and disk, and records seed plus source revision for reproduction: https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/internals/vopr.md . Its protocol-aware design adds internal cluster invariants beyond black-box client correctness: https://tigerbeetle.com/blog/2026-08-20-protocol-aware-dst/ . This is an architectural reference, not a claim that Raft and TigerBeetle's VSR have identical invariants or recovery assumptions.

## Acceptance evidence

A credible first result should include:

1. The generated `.wasm` hash and successful execution through the intended engine.
2. At least two runtime inputs to the same binary yielding different expected behavior.
3. Actual module coverage hits that differ for a known branch, plus bitmap reset/replay determinism checks.
4. A saved corpus and novelty decisions based on those hits, not only random generation.
5. A deliberately injected fault caught by an invariant and reduced to a replayable trace.
6. Campaign counts, limits, failures, and explicit exclusions, with no claim of full safety proof.
