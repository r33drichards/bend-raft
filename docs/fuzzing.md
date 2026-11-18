# Deterministic fault simulation and coverage-guided mutation

```
node tools/fuzz.mjs 20261118 500 300 --backend js
node tools/fuzz.mjs 20261118 500 300 --backend wasm
RAFT_WASM_TEST=1 node --test test/fuzz.test.mjs
```

Arguments are seed, runs, and scheduler steps per run. The WASM backend explicitly imports `host/wasm.mjs`; missing artifacts or runtime failures fail the command rather than falling back to JavaScript. It calls the Bend-compiled client and server functions through the same ADT facade. JavaScript executes `build/raft.mjs`, not a rewritten Raft implementation.

Each run starts with a protocol-generated election and committed operation. Subsequent four-byte scheduler actions induce election/heartbeat events, deliver a selected queued RPC, drop or duplicate RPCs, crash/recover servers, toggle directed partitions, propose operations, retry pending clients, deliver bursts, or heal and elect. RPCs are emitted by actual nodes, not fabricated messages. The simulated durable state is separate from the running state. Faults occur before atomic persistence (discard transition and its effects) or after atomic persistence but before any effects escape (recover the persisted transition). This is an atomic-storage model, not a test of a filesystem or torn writes.

An LCG generates deterministic bytes. Novel coverage retains a trace in the mutation corpus; later runs mutate existing inputs. The JS backend uses observable transition keys, **not instrumented JS branch coverage**. When the WASM facade exposes `resetCoverage` and `coverage`, nonzero instrumented bitmap slots are also retained as corpus coverage. Coverage includes the generated runtime and codec; it must not be described as exclusively Raft-source branch coverage. The bitmap resets between traces. Protocol state is freshly initialized each trace; the WASM facade remains loaded across CLI traces, so allocator/resource-leak behavior can affect long campaigns. The differential test loads a fresh facade for each seed.

Independent checks enforce term monotonicity, durable single-vote history, log matching, leader append-only behavior, local index bounds, historical leader uniqueness per term, historical committed-prefix agreement, replayed application values and session tables, consistent duplicate success results, and no success before corresponding application. Replay uses an independent counter/session evaluator. Clients use unique IDs and one sequence per client; this campaign does not thoroughly explore sequential multi-request clients or sequence exhaustion. Numeric domains remain small. Timeout behavior, scheduling distributions, and the synchronous atomic barrier simplify actual systems.

On failure, stderr includes a `REPLAY_JSON=` record with seed, iteration, and exact input bytes. Save the JSON value (without the prefix) to a file and run:

```
node tools/fuzz.mjs --backend wasm --replay failure.json
```

Replay with the same source/compiler/backend versions. The replay file initially contains a concrete schedule, not a minimized counterexample. To attempt bounded deterministic delta-debugging, run:

```
node tools/fuzz.mjs --backend wasm --minimize failure.json > smaller.json
```

This removes whole scheduler actions while preserving the exact error name/message, with a default 200-candidate budget. It revalidates the final failure and reports remaining steps, attempts and budget exhaustion. It does not guarantee a globally minimal trace. The regression test minimizes a deliberately injected application-state corruption; no genuine Raft failure was available to demonstrate minimization. Regression tests confirm deterministic state/effect fingerprints and intentionally corrupt application state to verify that the independent replay oracle fires. WASM differential tests compare the exact final state, queued messages, and successful responses against emitted JS and require nonzero instrumentation coverage.

Passing these tests is bounded empirical evidence, not a proof of Raft correctness, liveness, full history linearizability, or compiler refinement. Missing coverage, unmodeled external effects, allocator failures, real disk semantics and unbounded executions remain separate obligations.
