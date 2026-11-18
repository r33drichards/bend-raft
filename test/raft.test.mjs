import assert from 'node:assert/strict';
import test from 'node:test';
import R from '../build/raft.mjs';
const list = xs=>xs.reduceRight((tail,head)=>({$: 'Con',head,tail}),{$:'Nil'});
const array = x=> {let a=[];while(x.$==='Con'){a.push(x.head);x=x.tail;}return a;};
const recv=(s,from,message)=>R.step(s,{$:'Receive',from,message});
function cluster(){
 const states=[0,1,2].map(R.init), queue=[], replies=[];
 function event(id,e){const o=R.step(states[id],e);states[id]=o.state;for(const m of array(o.sends))queue.push({from:id,...m});replies.push(...array(o.replies));return o;}
 function drain(){let fuel=1000;while(queue.length){assert.ok(fuel-->0);const m=queue.shift();event(m.to,{$:'Receive',from:m.from,message:m.message});}}
 return {states,queue,replies,event,drain};
}
test('election, replicated write, logged read, duplicate suppression',()=>{
 const c=cluster();c.event(0,{$:'Timeout'});c.drain();assert.equal(c.states[0].role,2);
 c.event(0,{$:'Request',client:8,seq:1,op:{$:'Add',amount:7}});c.drain();
 assert.equal(c.states[0].value,7);assert.equal(c.states[0].applied,c.states[0].commit);
 assert.ok(c.replies.some(x=>x.$==='Applied'&&x.result===7));
 c.event(0,{$:'Request',client:8,seq:1,op:{$:'Add',amount:7}});c.drain();assert.equal(c.states[0].value,7);
 c.event(0,{$:'Request',client:8,seq:2,op:{$:'Read'}});c.drain();assert.equal(c.replies.at(-1).result,7);
 c.event(0,{$:'Heartbeat'});c.drain();for(const s of c.states)assert.equal(s.value,7);
});
test('duplicates and stale votes do not elect candidate',()=>{
 let s=R.step(R.init(0),{$:'Timeout'}).state;
 for(let i=0;i<5;i++)s=recv(s,1,{$:'Voted',term:0,voter:1,granted:true}).state;
 assert.equal(s.role,1);assert.equal(array(s.votes).length,1);
 // self-origin responses are ignored
 s=recv(s,0,{$:'Voted',term:1,voter:0,granted:true}).state;assert.equal(s.role,1);
});
test('vote persists across restart and cannot be cast twice',()=>{
 let s=recv(R.init(0),1,{$:'Vote',term:3,candidate:1,last_index:0,last_term:0}).state;
 s=R.restart(s);const o=recv(s,2,{$:'Vote',term:3,candidate:2,last_index:0,last_term:0});
 assert.equal(array(o.sends)[0].message.granted,false);assert.equal(o.state.vote.value,1);
});
const entry=t=>({$:'Entry',term:t,client:0,seq:0,op:{$:'Noop'}});
test('short delayed append retains suffix and bounds follower commit by matched index',()=>{
 let s={...R.init(1),term:2,log:list([entry(1),entry(2),entry(2)])};
 const o=recv(s,0,{$:'Append',term:2,leader:0,prev_index:1,prev_term:1,entries:list([]),commit:3});
 assert.equal(array(o.state.log).length,3);assert.equal(o.state.commit,1);
 const bad=recv(s,0,{$:'Append',term:2,leader:0,prev_index:2,prev_term:9,entries:list([]),commit:3});assert.deepEqual(bad.state.log,s.log);
});
test('commit requires current-term entry, stale responses ignored',()=>{
 let s={...R.init(0),term:3,role:2,log:list([entry(2)]),matches:list([1,1,1])};
 assert.equal(R.find_commit(1,s),0);
 const o=recv(s,1,{$:'Appended',term:2,follower:1,success:true,matched:1});assert.deepEqual(o.state.matches,s.matches);assert.equal(o.state.commit,0);
});
test('isolated leader cannot acknowledge new operation',()=>{
 const c=cluster();c.event(0,{$:'Timeout'});c.drain();c.replies.length=0;
 const o=c.event(0,{$:'Request',client:4,seq:1,op:{$:'Add',amount:9}});assert.equal(array(o.replies).length,0);assert.equal(o.state.value,0);
});
test('restart rebuilds application state from committed log',()=>{
 const c=cluster();c.event(0,{$:'Timeout'});c.drain();c.event(0,{$:'Request',client:1,seq:1,op:{$:'Add',amount:4}});c.drain();
 c.states[1]=R.restart(c.states[1]);c.event(0,{$:'Heartbeat'});c.drain();assert.equal(c.states[1].value,4);
});
test('client model keeps retry identity and advances only matching success',()=>{
 let c=R.client_begin(R.client_init(5),{$:'Add',amount:8});
 const first=R.client_request(c);c=R.client_begin(c,{$:'Add',amount:99});assert.deepEqual(R.client_request(c),first);
 c=R.client_reply(c,{$:'Applied',client:5,seq:9,result:8});assert.deepEqual(R.client_request(c),first);
 c=R.client_reply(c,{$:'Applied',client:5,seq:1,result:8});assert.equal(c.next_seq,2);assert.equal(R.client_request(c).$,'None');
});
test('host persists before effects and fail-stops after storage error',async()=>{
 const {server}=await import('../host/server.mjs');let calls=[];
 const h=server({state:R.init(0),persist:async()=>calls.push('persist'),send:async()=>calls.push('send'),reply:async()=>calls.push('reply'),resetTimer:async()=>calls.push('timer')});
 await h.dispatch({$:'Timeout'});assert.equal(calls[0],'persist');assert.ok(calls.includes('send'));
 const bad=server({state:R.init(0),persist:async()=>{throw Error('disk');},send:async()=>assert.fail('sent before persist'),reply:async()=>{},resetTimer:async()=>{}});
 await assert.rejects(bad.dispatch({$:'Timeout'}),/disk/);await assert.rejects(bad.dispatch({$:'Timeout'}),/stopped/);
});
test('pure main smoke trace commits value seven',()=>assert.equal(R.main(),7));
test('new leader retains committed value and fences old-term acknowledgments',()=>{
 const c=cluster();c.event(0,{$:'Timeout'});c.drain();
 c.event(0,{$:'Request',client:3,seq:1,op:{$:'Add',amount:6}});c.drain();c.event(0,{$:'Heartbeat'});c.drain();
 c.event(1,{$:'Timeout'});c.drain();assert.equal(c.states[1].role,2);assert.equal(c.states[0].role,0);assert.equal(c.states[1].value,6);
 c.event(1,{$:'Request',client:3,seq:2,op:{$:'Add',amount:4}});c.drain();c.event(1,{$:'Heartbeat'});c.drain();for(const s of c.states)assert.equal(s.value,10);
});
test('host recovery resets stale leader and replication progress before accepting events',async()=>{
 const {server}=await import('../host/server.mjs');const c=cluster();
 c.event(0,{$:'Timeout'});c.drain();c.event(0,{$:'Request',client:2,seq:1,op:{$:'Add',amount:5}});c.drain();
 const recovered=structuredClone(c.states[0]);assert.equal(recovered.role,2);let replies=[],sends=[];
 const h=server({state:recovered,persist:async()=>{},send:async(to,message)=>sends.push(message),reply:async r=>replies.push(r),resetTimer:async()=>{}});
 const boot=h.snapshot();assert.equal(boot.role,0);assert.deepEqual(array(boot.matches),[0,0,0]);assert.equal(boot.applied,0);assert.equal(boot.commit,0);
 assert.equal(boot.term,recovered.term);assert.deepEqual(boot.vote,recovered.vote);assert.deepEqual(boot.log,recovered.log);
 await h.dispatch({$:'Request',client:2,seq:2,op:{$:'Add',amount:9}});assert.equal(replies.at(-1).$,'Retry');assert.equal(sends.length,0);
 await h.dispatch({$:'Receive',from:1,message:{$:'Appended',term:recovered.term,follower:1,success:true,matched:array(recovered.log).length}});
 assert.equal(h.snapshot().role,0);assert.equal(h.snapshot().commit,0);assert.equal(h.snapshot().value,0);
 // Saved caller objects cannot mutate server state after construction.
 recovered.term=99;assert.equal(h.snapshot().term,boot.term);
});
