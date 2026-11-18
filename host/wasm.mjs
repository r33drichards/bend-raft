import {encode,decode} from '../tools/wire-schema.mjs';
// Actual compiled Bend execution, not a JS consensus fallback. The single WASM
// instance is stateless between calls except allocator and coverage bookkeeping.
// Returned ADTs are detached JS values; all consensus/client logic executes in WASM.
export async function loadWasm(){
 const {default:create}=await import('../build/wasm/raft.mjs');
 const wasm=await create();
 function invoke(call){
  const words=encode('Call',call);if(words.length>1048576)throw Error('ABI input limit');
  const ptr=wasm._malloc(words.length*8);if(!ptr)throw Error('WASM allocation failed');
  try{
   let heap=wasm.HEAPU32;
   for(let i=0;i<words.length;i++){heap[(ptr>>2)+i*2]=words[i]>>>0;heap[(ptr>>2)+i*2+1]=Math.floor(words[i]/4294967296);}
   const status=wasm._raft_call(ptr,words.length);if(status)throw Error(`WASM ABI status ${status}`);
   const outptr=wasm._raft_out_ptr(),len=wasm._raft_out_len();heap=wasm.HEAPU32;
   const out=[];for(let i=0;i<len;i++)out.push(heap[(outptr>>2)+i*2]+heap[(outptr>>2)+i*2+1]*4294967296);
   const answer=decode('Answer',out);return Object.values(answer)[1];
  }finally{wasm._free(ptr);}
 }
 return {
  backend:'wasm',
  init:id=>invoke({$:'ServerInit',id}),
  restart:state=>invoke({$:'ServerRestart',state}),
  step:(state,event)=>invoke({$:'ServerStep',state,event}),
  client_init:id=>invoke({$:'ClientInit',id}),
  client_begin:(client,op)=>invoke({$:'ClientBegin',client,op}),
  client_request:client=>invoke({$:'ClientRequest',client}),
  client_reply:(client,reply)=>invoke({$:'ClientReply',client,reply}),
  resetCoverage:()=>wasm._raft_cov_reset(),
  coverage:()=>wasm.HEAPU8.slice(wasm._raft_cov_ptr(),wasm._raft_cov_ptr()+wasm._raft_cov_len()),
  getCoverage:()=>wasm.HEAPU8.slice(wasm._raft_cov_ptr(),wasm._raft_cov_ptr()+wasm._raft_cov_len())
 };
}
