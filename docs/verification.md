# Raft verification plan and claim boundaries

## Status

This document is a proof plan, not a proof of this implementation. The short mathematical lemma below is proved under its stated assumptions. No theorem prover has checked that lemma here. Compiling Bend, running simulations, or passing finite tests does not establish unrestricted Raft correctness. No refinement proof connecting a Raft specification, this Bend implementation, bend-wasm, WebAssembly execution, and a host storage/network adapter has been produced.

Record each verification result with the source revision, exact command, parameters, explored states/traces, and outcome. Do not replace these details with “Raft is verified.”

## Primary sources and implementation references

- Ongaro and Ousterhout, *In Search of an Understandable Consensus Algorithm*, USENIX ATC 2014: https://www.usenix.org/conference/atc14/technical-sessions/presentation/ongaro . The extended paper's Figure 2 is the protocol checklist: https://raft.github.io/raft.pdf .
- Ongaro, *Consensus: Bridging Theory and Practice*, Stanford dissertation, 2014: https://github.com/ongardie/dissertation . Use the client-interaction, correctness, and availability material for obligations beyond the basic protocol.
- Original author-maintained TLA+ specification: https://github.com/ongardie/raft.tla . This is an external reference, not evidence that our executable refines it. Its README notes that TLC execution requires modifications.
- Current standalone etcd Raft library: https://github.com/etcd-io/raft . Its deterministic message/tick core leaves transport and persistence to the host. Consult `raft.go`, `rawnode.go`, `log.go`, `read_only.go`, `tracker/`, `quorum/`, and `confchange/`; pin a commit when using it as an oracle.

## Deliberately small initial specification

Assume a fixed, nonempty set V of unique server IDs. A quorum has strictly more than |V|/2 distinct IDs. Processes are non-Byzantine: they may stop/restart, and the network may delay, duplicate, reorder, or drop messages, but does not forge identities or mutate contents. Durable writes survive restart. All commands and state-machine application are deterministic.

The initial target should exclude membership changes, snapshots/compaction, lease reads, and Byzantine behavior. Read requests can be replicated commands, answered only after application. A complete implementation must state whether its host actually enforces durability; an in-memory demonstration does not satisfy crash-recovery assumptions.

Model persistent server state as `(currentTerm, votedFor, log)`. Model volatile state as `(role, commitIndex, lastApplied, leaderHint, electionVotes, nextIndex, matchIndex)`. Keep client requests and responses explicit, with `(clientId, requestSequence, command)` and a replicated deduplication/result table if retry suppression is claimed. Index zero is a sentinel, not a command. The model uses unbounded natural numbers; any bounded runtime representation needs overflow checks, not wraparound.

Use a deterministic transition function conceptually:

```
step(serverState, event) -> (serverState', orderedEffects)
```

A host supplies timer events, message deliveries, proposed commands, and successful durable-write acknowledgments. Effects include durable write, send, apply, and client reply. The concrete project API may package these differently; that packaging must preserve the ordering obligations below.

## A small proved lemma: election safety from durable votes

**Assumptions.** Within one term t, each voter grants a vote to at most one candidate, including its self-vote; every election certificate contains votes from a strict majority of distinct members of the same fixed V; certificates are associated with t and their candidate; the vote restriction survives crashes.

**Lemma.** No two different candidates have valid election certificates for term t.

**Proof.** Suppose candidates a and b have majority voter sets A and B. Since |A| > |V|/2 and |B| > |V|/2, |A| + |B| > |V|, so A and B intersect. A voter in their intersection voted for both a and b in term t. The single-vote assumption implies a = b, contradicting different candidates. QED.

This proves an implication about the abstract voting rules. It does not establish that the Bend code implements those rules. It also does not mean that old leaders immediately learn they are no longer leaders: leaders in different terms may coexist locally during a partition.

## Required safety invariants and preservation obligations

| Property | Precise target | High-risk transition |
| --- | --- | --- |
| Term monotonicity | A server's term never decreases, including across restart. | Receive higher-term RPC; reload persistent state. |
| Durable single vote | For each `(voter, term)`, at most one candidate receives a granted vote. | Self-election, RequestVote, crash between save and send. |
| Election safety | At most one elected leader per term. | Vote-response handling; duplicates and stale replies. |
| Log matching | If two log entries have the same index and term, their prefixes through that index agree. | AppendEntries consistency check and suffix replacement. |
| Leader append-only | While remaining leader, a server only appends to its log. | Client proposals and retry handling. |
| Leader completeness | An entry committed in term t appears in every leader's log in higher terms. | Election log freshness and current-term commitment rule. |
| State-machine safety | Applied commands at the same log index agree across servers. | Commit advancement, apply loop, crash recovery. |
| Local index bounds | `0 <= lastApplied <= commitIndex <= lastLogIndex`. | Append, commit, restart; excludes snapshots in this version. |
| Response soundness | A successful client response identifies a committed, applied command/result. | Application and response effects, leader changes. |
| Retry suppression | The same client request identity never mutates replicated application state twice. | Replay, retries after lost responses, new leader. |

Do not assume leader completeness merely from the quorum lemma. Its induction depends on both the election freshness restriction and the log/commit rules. A full proof should establish the relevant invariant jointly, following the paper/dissertation rather than circularly assuming committed entries are retained.

## Transition rules worth targeted tests

1. Candidate counts unique votes from configured voters, in its current election term, only while still a candidate. A delayed response from a prior election must not count.
2. On a higher term, step down and reset the term's vote; persist this change before sending dependent responses. Lower-term traffic cannot mutate current-term election or replication progress.
3. A vote grant requires both vote availability and lexicographic log freshness `(lastLogTerm, lastLogIndex)`. Persist the grant before acknowledging it.
4. Failed `prevLogIndex/prevLogTerm` checks do not change the log. A successful append deletes a suffix only at the first conflicting entry. An old shorter append must not truncate an already matching longer log.
5. Append success is emitted only after the accepted log entries and required hard state are durable.
6. Leader advances commit by a majority's replication only when the candidate commit index holds an entry from its current term. Older entries become committed indirectly through that prefix. Count the leader's own durable copy, not an unpersisted optimistic append.
7. Follower advances commit to at most the last index matched by that AppendEntries RPC, not an unrelated divergent suffix. Commit and apply do not move backward during uninterrupted execution.
8. Successful acknowledgments increase match progress monotonically only for the appropriate current-term peer/RPC context. Delayed failures must not regress progress incorrectly or cause committed-log deletion.
9. Apply strictly in order. Treat command application plus durable deduplication/application checkpoint consistently across restart; otherwise a crash can apply a command twice to an external side effect.
10. Validate malformed IDs, bounds, terms, wire tags and lengths. Reject exhaustion of bounded terms/indices/sequences. A Wasm trap is not a valid consensus transition.

## Client semantics

A timeout means “unknown,” not “failed.” The command may have committed even if the reply was lost. Retrying the same request identity lets the replicated state machine return the prior result without repeating its mutation. Specify whether each client is limited to one outstanding request; a single latest-sequence cache is not sufficient to recover arbitrary older concurrent requests/results.

For a proof of linearizability, define an abstract sequential object, record invocation/response histories, and show a legal sequential ordering respecting real-time precedence. Successful operations may be linearized at their log commitment/application ordering as appropriate to the specification, but this requires an actual simulation argument. Local leader reads without a fresh quorum or logged read are not safe just because the server still believes it is leader.

No promise of globally exactly-once external effects is warranted without an atomic transactional bridge or idempotency at the external destination. In-memory deduplication only demonstrates retry behavior within that execution.

## Execution and verification layers

1. **Bend unit/regression tests.** Exercise each rule above, including duplicate and reordered RPCs, three-way elections, lost replies, obsolete terms, and conflicting suffixes. Report tested traces, not proofs.
2. **Finite explicit-state model checking.** Start with 3 voters, 2 clients, terms 0..2, log length <=2, a small command domain, bounded queued messages, and a specified transition-depth limit. Include crash/restart and pending persistence separately from send eligibility. Check invariants after every step, and retain counterexample traces. Omitting a transition that exceeds the bound restricts coverage; never model numeric wraparound as a valid term transition. Passing this finite exploration is a bounded result only.
3. **Differential testing.** Translate identical logical events into the executable and a pinned independent reference/specification. Account for permitted differences in batching/timing. Test state, effects, and client histories, not only final totals.
4. **Unbounded proof.** State `Init` and `Next`, choose a strengthened inductive invariant I, prove `Init => I` and `I /\ Next => I'`, then derive safety. An implementation refinement must separately map concrete state/effects to the abstract specification.
5. **Wasm/host integration.** Compile the same tested sources with the intended bend-wasm revision. Check serialization round-trips and deterministic native-versus-Wasm transition results. Inject host failures before/after each persistence barrier. Confirm storage completion means durability, not merely queued I/O. A successful compiler invocation alone does not establish these properties.

## Liveness and modern extensions

Safety should hold despite arbitrary delay; progress cannot be unconditional in an asynchronous crash-prone system. State liveness assumptions explicitly: eventually stable communication and scheduling, a functioning majority, successful durable storage, and suitable election-timeout behavior.

Modern etcd extensions worth adding only after baseline invariants hold:

- **PreVote:** avoids isolated/rejoining nodes unnecessarily increasing the cluster term; requires a separate pre-election path that does not persist a real vote or advance the real term merely on a pre-vote request.
- **CheckQuorum:** makes a leader step down after sustained loss of majority activity; helps availability behavior but does not itself make stale reads safe.
- **ReadIndex:** quorum-confirmed read barriers, plus waiting until local application reaches the barrier, avoid logging every read. Follow the current-term commitment precondition in the reference implementation.
- **Pipelining, batching, and bounded inflight work:** improve throughput and memory bounds; introduce delayed/overlapping acknowledgments that need independent tests.
- **Lease reads:** defer; they add clock assumptions absent from the basic safety model.
- **Membership and snapshots:** require new invariants about quorum intersection across configurations, state transfer, compaction boundaries, and retained client deduplication metadata. They are not small switches on the fixed-membership proof.

References for the extension list and host responsibilities: https://raw.githubusercontent.com/etcd-io/raft/main/README.md and https://raw.githubusercontent.com/etcd-io/raft/main/raft.go . These links track upstream; pin revisions for reproducible comparisons.

## Current code mapping and executed micro-model

The initial `src/raft.bend` models three server IDs, 0, 1, and 2. Its `step(State, Event)` produces `Output{state, sends, replies, reset_timer}`. It sends full log suffixes in Append messages. The application is a deterministic counter with `Add` and logged `Read` operations. Sessions retain each client's latest sequence and cached result. This supports a sequential client discipline, not arbitrary concurrent outstanding requests with recoverable historical results.

Because `Output` has no explicit durable-write-completion event, the host contract is stronger than the conceptual event/effect model above: **durably save required term/vote/log state before releasing any dependent sends or replies**. Do not interleave later steps or publish effects in a way that violates that barrier. Application state/checkpoint recovery must remain consistent with the applied prefix. The supplied pure state transition is not itself a disk or transport implementation.

Run the independent finite micro-model with:

```
python3 tools/check_election_certificates.py
```

Observed result: **547 reachable states, 2,730 generated edges including stuttering edges, election-certificate uniqueness PASS**. This exploration is complete for its finite abstraction: exactly three voters/candidates, one term, persistent grants, separate grant and delivery actions, duplicate deliveries, and candidate crashes that clear volatile tallies. It keeps historical election certificates when a candidate crashes.

This is a deliberately narrow voting model. It does **not** model log replication, multiple terms, actual persistence I/O, request validation, client histories, Bend execution, or the compiler/runtime. Its transitions assume the durable single-vote rule instead of proving that the executable obeys it. It is neither a full Raft model checker nor an implementation proof. The rest of the checks described above remain a plan unless separately recorded as executed.

## Executed implementation-local evidence

The pinned Bend 2.0.39 checker accepts four source lemmas in `src/raft.bend`: `proof_restart_term`, `proof_restart_vote`, `proof_restart_log`, and `proof_sentinel`. These are definitional equalities of the actual functions, not proofs of quorum intersection, distributed safety, linearizability, or refinement. `node tools/compile.mjs` checks the whole source and rejects holes before emission. `node --test test/raft.test.mjs` passes 12 tests of the generated JS, including leader replacement and host persist-before-effects/fail-stop behavior and safe constructor recovery. Raw results are in `build/test-results.txt` and `build/model-results.json`. The later WASM extension now executes the actual compiled client/server; see `build/wasm/validation.json` and the README for completed differential checks and campaign status. These checks do not establish unrestricted correctness or compiler refinement.
