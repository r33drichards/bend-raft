# Experimental ABI: raft-list-nat-v1

The ABI serializes **all** server or client state on every call. No hidden server
identity, network, clock, randomness, disk or client state is stored in the module.
Allocator state and instrumentation counters remain between calls. Do not call
an instance concurrently. The 512 MiB runtime corpus is per WASM instance.

## Exports

- `malloc(byte_count) -> ptr`, `free(ptr)`.
- `raft_call(input_ptr, word_count) -> status`.
- `raft_out_ptr() -> ptr`, `raft_out_len() -> word_count`.
- `raft_cov_ptr() -> ptr`, `raft_cov_len() -> byte_count`, `raft_cov_reset()`.

Pointers are wasm32 byte offsets. Words are unsigned little-endian 64-bit values,
restricted to `0..2^48-1`. Inputs must be 8-byte aligned, valid in-bounds allocations.
Output is borrowed, must be copied before another call, and must not be freed by
the caller. The JS facade refreshes memory views after calls because memory may
grow. The memory and allocator remain owned by the WASM module.

Status 0 is success; 1 is input word limit; 2 is out-of-range Nat; 3 is an unexpected
compiled root arity; 4 is output word limit. Both limits are 1,048,576 words.
Other runtime failures may trap/terminate the module and require discarding it.
This interface is **not** a safe parser for malicious pointers or malformed wire
values. Use the validated schema facade and authenticated, bounded ingress.

## Value encoding

`tools/wire-schema.mjs` is authoritative for the ordered constructors/fields.
A Nat encodes as `[value]`. A boolean encodes as `[0]` or `[1]`. A constructor is:

```
[zero_based_constructor_index,
 field_0_word_count, ...field_0_words,
 field_1_word_count, ...field_1_words, ...]
```

Requests have schema `Call`, and results have schema `Answer`.
For example `ServerInit{id:0}` encodes `[0,1,0]`. List and Maybe values are explicit
constructors, not special packed arrays. Generated, typechecked Bend code performs
all conversions between wire lists and protocol/client ADTs. The C adapter only
packs/unpacks `List<Nat>` runtime objects; it contains no protocol decisions.

The schema/version must match the module. Constructor indexes are local to each
type, not Bend runtime constructor IDs. The encoding does not expose Bend heap
addresses, tags, layout or refcounts.

## Runtime host requirements

This build was exercised through Emscripten's Node ES-module loader. The module
exports readable names but imports Emscripten helpers and a subset of WASI libc
functions. It is not an independently tested WASI component or browser package.
Other hosts must provide matching imports, call the module's initialization
constructors, honor memory limits and support the WASM tail-call extension.
`host/wasm.mjs` is the tested adapter.

## Coverage

LLVM trace-pc-guard instruments the generated C module, including the compiled
Bend protocol/client, serialization code and runtime. Guard IDs are fixed within
the exact binary. The no-sanitize callbacks set one byte per visited guard;
reset clears bytes, not guard IDs. A hit is evidence of actual WASM execution,
not JS-wrapper coverage. Runtime/allocator paths add noise; counts cannot be
interpreted as Raft source coverage percentages or proof of tested state space.
