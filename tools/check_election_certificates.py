#!/usr/bin/env python3
"""Exhaustive finite check of one-term election certificates, NOT full Raft.

Three fixed voters/candidates; durable single vote per voter. A vote grant and
its delivery are separate actions. Delivery can repeat (set insertion is
idempotent). Candidate crash clears received votes, never durable grants or
historical election certificates. Stuttering/drop/no-delivery does not change
state and is omitted. No logs, terms, RPC validation, storage implementation,
linearizability, or liveness are modeled. This does not execute Bend.
"""
from collections import deque
import json

N = 3
QUORUM = N // 2 + 1
# (durable grants: -1 or candidate ID, volatile received masks, historical winners)
initial = ((-1,) * N, (0,) * N, 0)
seen = {initial}
work = deque([initial])
edges = 0

def successors(state):
    grants, received, winners = state
    for voter in range(N):
        if grants[voter] == -1:
            for candidate in range(N):
                g = list(grants)
                g[voter] = candidate
                yield (tuple(g), received, winners)
        else:
            candidate = grants[voter]
            r = list(received)
            r[candidate] |= 1 << voter
            yield (grants, tuple(r), winners)
    for candidate in range(N):
        if received[candidate].bit_count() >= QUORUM:
            yield (grants, received, winners | (1 << candidate))
        if received[candidate]:
            r = list(received)
            r[candidate] = 0  # crash/restart loses only volatile tally
            yield (grants, tuple(r), winners)

while work:
    state = work.popleft()
    assert state[2].bit_count() <= 1, f"Two election certificates: {state}"
    for candidate, mask in enumerate(state[1]):
        assert all(not (mask & (1 << v)) or state[0][v] == candidate for v in range(N))
    for next_state in successors(state):
        edges += 1
        if next_state not in seen:
            seen.add(next_state)
            work.append(next_state)

print(json.dumps({
    "model": "single-term election certificates, not full Raft",
    "voters": N,
    "quorum": QUORUM,
    "reachable_states": len(seen),
    "generated_edges_including_stutter": edges,
    "complete_for_this_finite_model": True,
    "election_certificate_uniqueness": "PASS",
    "implementation_refinement": "NOT CHECKED",
}, indent=2))
