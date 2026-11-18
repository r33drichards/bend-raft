import test from 'node:test';
import assert from 'node:assert/strict';
import {fuzz,simulate,random,minimize} from '../tools/fuzz.mjs';
import R from '../build/raft.mjs';
const bytes=seed=>{const rng=random(seed);return Array.from({length:800},()=>rng()>>>24);};
test('deterministic fault simulator replays exact state and effects',()=>{
 const a=simulate(bytes(42)),b=simulate(bytes(42));assert.equal(a.fingerprint,b.fingerprint);assert.deepEqual(a.coverage,b.coverage);assert(a.coverage.has('crash'));
});
test('state-guided mutations are reproducible and check safety',()=>{
 const opts={seed:90210,runs:30,steps:150};assert.deepEqual(fuzz(opts),fuzz(opts));
});
test('independent replay oracle rejects corrupted application state',()=>{
 const bad={...R,step:(s,e)=>{const o=R.step(s,e);o.state.value+=1;return o;}};
 assert.throws(()=>simulate(bytes(1),{core:bad}),/application replay mismatch/);
});
test('actual WASM differential replay matches emitted JS', {skip:process.env.RAFT_WASM_TEST!=='1'},async()=>{
 const {loadWasm}=await import('../host/wasm.mjs');
 for(const seed of [1,42,90210]){
  const core=await loadWasm(),trace=bytes(seed);
  const native=simulate(trace),wasm=simulate(trace,{core});assert.equal(wasm.fingerprint,native.fingerprint);assert.deepEqual(new Set([...wasm.coverage].filter(x=>!x.startsWith('wasm-edge:'))),native.coverage);assert([...wasm.coverage].some(x=>x.startsWith('wasm-edge:')),'actual WASM instrumented coverage required');
 }
});

test('bounded minimizer preserves the detected failure',()=>{
 const bad={...R,step:(s,e)=>{const o=R.step(s,e);o.state.value+=1;return o;}};
 const result=minimize({bytes:bytes(1)},{core:bad});assert.equal(result.bytes.length,0);assert.match(result.minimization.signature,/application replay mismatch/);
 assert.throws(()=>minimize({bytes:bytes(1)}),/does not fail/);
});
