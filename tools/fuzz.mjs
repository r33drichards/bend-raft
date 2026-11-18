/** Deterministic state-guided fuzzing of the actual emitted Bend JS core.
 * Uses instrumented WASM edge coverage when the supplied backend exposes it.
 * JS uses observable transition coverage only. This is not a full model checker.
 * No host disk/transport faults beyond the explicitly modeled atomic barrier.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import R from '../build/raft.mjs';
const arr=x=>{const a=[];for(;x.$==='Con';x=x.tail)a.push(x.head);return a;};
const clone=x=>structuredClone(x);
export function random(seed){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x;};}
const key=e=>JSON.stringify(e);
export function simulate(bytes,{core=R}={}){
 core.resetCoverage?.();
 let states=[0,1,2].map(core.init),durable=states.map(clone),queue=[],blocked=new Set(),down=new Set();
 const coverage=new Set(),leaders=new Map(),committed=new Map(),responses=new Map(),trace=[];
 let sequence=1; const clients=new Map(),votes=new Map(),terms=[0,0,0];
 function check(){
  for(const s of states){
   assert(s.term>=terms[s.id],'term decreased');terms[s.id]=s.term;
   if(s.vote.$==='Some'){const k=`${s.id}:${s.term}`,old=votes.get(k);assert(old===undefined||old===s.vote.value,'multiple durable votes in term');votes.set(k,s.vote.value);}
   const log=arr(s.log);assert(s.applied<=s.commit&&s.commit<=log.length,'index bounds');
   if(s.role===2){const old=leaders.get(s.term);assert(old===undefined||old===s.id,'two leaders in one term');leaders.set(s.term,s.id);}
   for(let j=0;j<s.commit;j++){const old=committed.get(j);assert(old===undefined||old===key(log[j]),'committed prefix disagreement');committed.set(j,key(log[j]));}
   // Independent deterministic state-machine replay, including session deduplication.
   let value=0;const sessions=new Map();
   for(const e of log.slice(0,s.applied)){
    if(e.op.$==='Noop')continue;
    const prev=sessions.get(e.client);
    if(prev&&e.seq<=prev.seq)continue;
    if(e.op.$==='Add')value+=e.op.amount;
    sessions.set(e.client,{seq:e.seq,result:value});
   }
   for(const peer of states){const other=arr(peer.log);for(let j=0;j<Math.min(log.length,other.length);j++)if(log[j].term===other[j].term)assert.deepEqual(log.slice(0,j+1),other.slice(0,j+1),'log matching');}
   assert.equal(s.value,value,'application replay mismatch');
   const actual=arr(s.sessions);assert.equal(actual.length,sessions.size,'session count');
   for(const v of actual)assert.deepEqual({seq:v.seq,result:v.result},sessions.get(v.client),'session replay mismatch');
  }
 }
 function event(id,e,fail=false){
  if(down.has(id))return;
  const before=states[id],o=core.step(clone(before),clone(e));
  if(before.role===2&&o.state.role===2&&before.term===o.state.term)assert.deepEqual(arr(o.state.log).slice(0,arr(before.log).length),arr(before.log),'leader append only');
  const msgs=arr(o.sends),replies=arr(o.replies);
  const label=[before.role,e.$,e.message?.$,e.message?.success,o.state.role,o.state.term>before.term,o.state.commit>before.commit,msgs.length,replies.map(r=>r.$).join(',')].join('|');
  coverage.add(label);
  if(fail===true){states[id]=core.restart(clone(durable[id]));coverage.add('persist-failure');return;}
  durable[id]=clone(o.state);states[id]=o.state;
  if(fail===2){states[id]=core.restart(clone(durable[id]));coverage.add('crash-after-persist-before-effects');check();return;}
  for(const m of msgs)queue.push({from:id,to:m.to,message:clone(m.message)});
  for(const r of replies){if(r.$!=='Applied')continue;
   if(clients.has(r.client))clients.set(r.client,core.client_reply(clients.get(r.client),clone(r)));
   const k=`${r.client}:${r.seq}`,old=responses.get(k);assert(old===undefined||old===r.result,'inconsistent successful retry result');responses.set(k,r.result);
   assert(arr(o.state.log).slice(0,o.state.applied).some(e=>e.client===r.client&&e.seq===r.seq),'reply before application');
  }
  check();
 }
 function drain(limit=300){while(queue.length&&limit--){const m=queue.shift();if(!blocked.has(`${m.from}:${m.to}`)&&!down.has(m.to))event(m.to,{$:'Receive',from:m.from,message:m.message});}}
 function propose(id,d){const who=sequence++,client=core.client_begin(core.client_init(who),d%3?{$:'Add',amount:1+d%9}:{$:'Read'});clients.set(who,client);event(id,core.client_request(client).value);}
 // Start with a real protocol election/commit, not hand-constructed server states.
 event(0,{$:'Timeout'});drain();propose(0,1);drain();event(0,{$:'Heartbeat'});drain();
 for(let p=0;p+3<bytes.length;p+=4){
  const [a,b,c,d]=bytes.slice(p,p+4),id=b%3,op=a%12;trace.push([a,b,c,d]);
  switch(op){
   case 0:event(id,{$:'Timeout'},d%17===0);break;
   case 1:event(id,{$:'Heartbeat'});break;
   case 2:if(queue.length){const n=c%queue.length,m=queue.splice(n,1)[0];if(!blocked.has(`${m.from}:${m.to}`)&&!down.has(m.to))event(m.to,{$:'Receive',from:m.from,message:m.message},d%31===0?true:d%31===1?2:false);}break;
   case 3:if(queue.length)queue.splice(c%queue.length,1);coverage.add('drop');break;
   case 4:if(queue.length&&queue.length<2000)queue.push(clone(queue[c%queue.length]));coverage.add('duplicate');break;
   case 5:down.add(id);states[id]=core.restart(clone(durable[id]));coverage.add('crash');break;
   case 6:down.delete(id);states[id]=core.restart(clone(durable[id]));coverage.add('restart');break;
   case 7:{const edge=`${id}:${c%3}`;blocked.has(edge)?blocked.delete(edge):blocked.add(edge);coverage.add('partition-toggle');break;}
   case 8:propose(id,d);break;
   case 9: // retry the same request identity and payload, possibly after leadership change
    {const cs=[...clients.values()];if(cs.length){const r=core.client_request(cs[c%cs.length]);if(r.$==='Some')event(id,r.value);}break;}
   case 10:drain(1+d%40);break;
   case 11:blocked.clear();for(const n of down)states[n]=core.restart(clone(durable[n]));down.clear();event(id,{$:'Timeout'});drain();event(id,{$:'Heartbeat'});drain();coverage.add('heal-and-elect');break;
  }
  check();assert(queue.length<10000,'simulator resource bound');
 }
 if(core.coverage){const bitmap=core.coverage();for(let i=0;i<bitmap.length;i++)if(bitmap[i])coverage.add(`wasm-edge:${i}`);}
 return {coverage,steps:trace.length,delivered:responses.size,fingerprint:JSON.stringify({states,queue,responses:[...responses]})};
}
export function fuzz({seed=1,runs=100,steps=200,core=R,backend='generated-js'}={}){
 const rng=random(seed),coverage=new Set(),corpus=[],stats={seed,runs,steps,backend,coverage_kind:core.coverage?'wasm-code-and-state':'observable-state-only',coverage:0,corpus:0};
 for(let i=0;i<runs;i++){
  let bytes;
  if(corpus.length&&rng()%4){bytes=corpus[rng()%corpus.length].slice();for(let n=1+rng()%16;n--;){bytes[rng()%bytes.length]=rng()>>>24;}}
  else bytes=Array.from({length:steps*4},()=>rng()>>>24);
  try{const result=simulate(bytes,{core});let fresh=false;for(const k of result.coverage)if(!coverage.has(k)){coverage.add(k);fresh=true;}if(fresh)corpus.push(bytes);}
  catch(error){error.replay={seed,iteration:i,bytes};throw error;}
 }
 const wasm_edges=[...coverage].filter(k=>k.startsWith('wasm-edge:')).length;
 return {...stats,coverage:coverage.size,wasm_edges,state_transitions:coverage.size-wasm_edges,corpus:corpus.length};
}
// Delta-debugging removes complete four-byte actions, retaining the same failure.
export function minimize(data,{core=R,maxAttempts=200}={}){
 const failure=bytes=>{try{simulate(bytes,{core});return null;}catch(e){return `${e.name}:${e.message}`;}};
 let bytes=data.bytes.slice(),attempts=0,parts=2;
 const signature=failure(bytes);if(!signature)throw Error('Replay does not fail; nothing to minimize');
 while(bytes.length&&attempts<maxAttempts){
  const actions=Math.ceil(bytes.length/4),chunk=Math.ceil(actions/parts)*4;let reduced=false;
  for(let start=0;start<bytes.length&&attempts<maxAttempts;start+=chunk){
   const candidate=bytes.slice(0,start).concat(bytes.slice(start+chunk));attempts++;
   if(failure(candidate)===signature){bytes=candidate;parts=Math.max(2,parts-1);reduced=true;break;}
  }
  if(!reduced){if(parts>=actions)break;parts=Math.min(actions,parts*2);}
 }
 assert.equal(failure(bytes),signature,'minimized replay must reproduce');
 return {...data,bytes,minimization:{signature,attempts,original_steps:Math.floor(data.bytes.length/4),remaining_steps:Math.floor(bytes.length/4),budget:maxAttempts,budget_exhausted:attempts>=maxAttempts}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2),bi=args.indexOf('--backend');const backend=bi<0?'js':args.splice(bi,2)[1];if(!['js','wasm'].includes(backend))throw Error('backend must be js or wasm');
  const core=backend==='wasm'?await (await import('../host/wasm.mjs')).loadWasm():R;
  const replay=args.indexOf('--replay'),mini=args.indexOf('--minimize');
  if(mini>=0){const data=JSON.parse(fs.readFileSync(args[mini+1],'utf8'));console.log(JSON.stringify(minimize(data,{core})));process.exit(0);}
  if(replay>=0){const data=JSON.parse(fs.readFileSync(args[replay+1],'utf8'));const r=simulate(data.bytes,{core});console.log(JSON.stringify({backend,steps:r.steps,coverage:r.coverage.size}));}
  else console.log(JSON.stringify(fuzz({seed:Number(args[0]||1),runs:Number(args[1]||100),steps:Number(args[2]||200),core,backend})));
 }catch(e){console.error(e.stack);if(e.replay)console.error('REPLAY_JSON='+JSON.stringify(e.replay));process.exitCode=1;}
}
